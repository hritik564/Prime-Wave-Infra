// ── BSC JSON-RPC Client ───────────────────────────────────────────────────────
//
// Handles raw HTTP communication with BSC JSON-RPC endpoints.
// The adapter never imports this layer directly — all network I/O lives here.
//
// Resilience model:
//   For each provider (primary → secondary → tertiary):
//     Attempt the call up to rpcMaxRetries times with exponential backoff.
//     On network-level failure (timeout, connection refused, HTTP error):
//       → retry same provider, then fail over to next.
//     On valid JSON-RPC error response (node responded with error):
//       → fail over immediately (the node itself is rejecting the request).
//   If all providers exhausted: throw AllProvidersExhaustedError.

import { logger } from "../../../lib/logger";
import type { BscConfig } from "./bsc-config";

// ── JSON-RPC wire types ───────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method:  string;
  params:  unknown[];
  id:      number;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: string;
  id:      number;
  result?: T;
  error?:  { code: number; message: string };
}

// ── Custom errors ─────────────────────────────────────────────────────────────

export class RpcNetworkError extends Error {
  constructor(message: string, readonly provider: string) {
    super(message);
    this.name = "RpcNetworkError";
  }
}

export class RpcResponseError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly code:     number,
  ) {
    super(message);
    this.name = "RpcResponseError";
  }
}

export class AllProvidersExhaustedError extends Error {
  constructor(readonly method: string, readonly providers: string[]) {
    super(
      `All BSC RPC providers exhausted for method "${method}" ` +
      `(${providers.length} provider(s) tried)`,
    );
    this.name = "AllProvidersExhaustedError";
  }
}

// ── Request ID counter ────────────────────────────────────────────────────────

let _idCounter = 1;
function nextId(): number { return _idCounter++; }

// ── Sleep helper ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── BscRpcClient ──────────────────────────────────────────────────────────────

export class BscRpcClient {
  constructor(private readonly config: BscConfig) {}

  /**
   * Call a BSC JSON-RPC method with automatic provider failover and retry.
   *
   * Returns the `result` field from the JSON-RPC response.
   * Returns null if the provider explicitly returns result: null (e.g. tx not found).
   * Throws AllProvidersExhaustedError if every provider fails on every attempt.
   */
  async call<T>(method: string, params: unknown[]): Promise<T> {
    const { rpcProviders, rpcMaxRetries } = this.config;

    if (rpcProviders.length === 0) {
      throw new Error("BscRpcClient: no RPC providers configured (set BSC_RPC_PRIMARY)");
    }

    let lastError: Error = new Error("No providers attempted");

    for (let pi = 0; pi < rpcProviders.length; pi++) {
      const provider = rpcProviders[pi];
      let attempt    = 0;
      const maxAttempts = method === "eth_sendRawTransaction" ? 1 : rpcMaxRetries;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          const result = await this.callProvider<T>(provider, method, params);

          if (pi > 0 || attempt > 1) {
            logger.info(
              { method, providerIndex: pi, attempt },
              "BSC RPC: call succeeded after failover/retry",
            );
          }

          return result;

        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const isRpcError = err instanceof RpcResponseError;

          if (isRpcError) {
            // The node responded with a JSON-RPC error — fail over immediately,
            // retrying the same node won't help.
            logger.warn(
              { method, providerIndex: pi, code: (err as RpcResponseError).code, msg: err.message },
              "BSC RPC: JSON-RPC error — failing over to next provider",
            );
            break; // exit inner retry loop → try next provider
          }

          // A raw broadcast is deliberately never retried or failed over after
          // a network error: the node may have accepted it before the timeout.
          if (method === "eth_sendRawTransaction") {
            logger.warn(
              { method, providerIndex: pi, err: lastError.message },
              "BSC RPC: broadcast outcome unknown — no retry attempted",
            );
            throw lastError;
          }

          // Network-level error — retry same provider with backoff
          if (attempt < maxAttempts) {
            const backoffMs = 500 * Math.pow(2, attempt - 1);
            logger.warn(
              { method, providerIndex: pi, attempt, backoffMs, err: lastError.message },
              "BSC RPC: network error — retrying",
            );
            await sleep(backoffMs);
          } else {
            logger.warn(
              { method, providerIndex: pi, attempts: attempt, err: lastError.message },
              "BSC RPC: provider exhausted — failing over",
            );
          }
        }
      }
    }

    logger.error(
      { method, providerCount: rpcProviders.length, err: lastError.message },
      "BSC RPC: all providers exhausted",
    );
    throw new AllProvidersExhaustedError(method, rpcProviders);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async callProvider<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const id         = nextId();
    const body       = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id,
    } satisfies JsonRpcRequest);

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.config.rpcTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body,
        signal:  controller.signal,
      });
    } catch (err) {
      // fetch() rejected — timeout (AbortError) or connection refused
      const msg = err instanceof Error ? err.message : String(err);
      throw new RpcNetworkError(`fetch failed: ${msg}`, url);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new RpcNetworkError(
        `HTTP ${response.status} ${response.statusText}`,
        url,
      );
    }

    let json: JsonRpcResponse<T>;
    try {
      json = await response.json() as JsonRpcResponse<T>;
    } catch {
      throw new RpcNetworkError("Failed to parse JSON-RPC response body", url);
    }

    if (json.error) {
      throw new RpcResponseError(
        `JSON-RPC error ${json.error.code}: ${json.error.message}`,
        url,
        json.error.code,
      );
    }

    // result can legitimately be null (e.g. tx not found)
    return json.result as T;
  }
}
