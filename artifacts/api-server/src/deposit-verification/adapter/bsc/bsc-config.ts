// ── BSC RPC Configuration ─────────────────────────────────────────────────────
//
// All values read from environment variables at startup.
// No value is hardcoded — operator must set at minimum BSC_RPC_PRIMARY.
// If BSC_RPC_PRIMARY is absent the factory falls back to MockBlockchainAdapter.

export interface BscConfig {
  /** Ordered list of JSON-RPC endpoint URLs (primary → secondary → tertiary). */
  rpcProviders:           string[];
  /** USDT BEP20 token contract address on BSC (lowercase). */
  usdtContractAddress:    string;
  /** Expected BSC chain ID (56 = mainnet, 97 = testnet). */
  chainId:                number;
  /** Confirmations required before a deposit is credited. */
  requiredConfirmations:  number;
  /** Per-request HTTP timeout in milliseconds. */
  rpcTimeoutMs:           number;
  /** Max attempts per provider before failing over to the next. */
  rpcMaxRetries:          number;
}

// ── BSC mainnet constants ─────────────────────────────────────────────────────

/** Official Binance-pegged USDT on BSC mainnet (18 decimals). */
const DEFAULT_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";

/** BSC mainnet chain ID. */
const DEFAULT_CHAIN_ID = 56;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return isNaN(n) || n <= 0 ? fallback : n;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Build BscConfig from environment variables.
 *
 * Required env vars (at least one RPC URL):
 *   BSC_RPC_PRIMARY        — primary JSON-RPC endpoint URL
 *   BSC_RPC_SECONDARY      — (optional) secondary failover URL
 *   BSC_RPC_TERTIARY       — (optional) tertiary failover URL
 *
 * Optional env vars (defaults to BSC mainnet values):
 *   BSC_USDT_CONTRACT         — USDT contract address (default: Binance-pegged USDT)
 *   BSC_CHAIN_ID              — chain ID (default: 56)
 *   BSC_REQUIRED_CONFIRMATIONS — block depth before credit (default: 12)
 *   BSC_RPC_TIMEOUT_MS        — per-request timeout ms (default: 10000)
 *   BSC_RPC_MAX_RETRIES       — attempts per provider before failover (default: 3)
 */
export function getBscConfig(): BscConfig {
  const providers: string[] = [];
  if (process.env.BSC_RPC_PRIMARY)   providers.push(process.env.BSC_RPC_PRIMARY.trim());
  if (process.env.BSC_RPC_SECONDARY) providers.push(process.env.BSC_RPC_SECONDARY.trim());
  if (process.env.BSC_RPC_TERTIARY)  providers.push(process.env.BSC_RPC_TERTIARY.trim());

  const rawContract = process.env.BSC_USDT_CONTRACT ?? DEFAULT_USDT_CONTRACT;

  return {
    rpcProviders:          providers,
    usdtContractAddress:   rawContract.trim().toLowerCase(),
    chainId:               readInt("BSC_CHAIN_ID",               DEFAULT_CHAIN_ID),
    requiredConfirmations: readInt("BSC_REQUIRED_CONFIRMATIONS",  12),
    rpcTimeoutMs:          readInt("BSC_RPC_TIMEOUT_MS",          10_000),
    rpcMaxRetries:         readInt("BSC_RPC_MAX_RETRIES",          3),
  };
}

/**
 * Returns true if at least one RPC provider URL is configured.
 * The adapter factory uses this to decide between real and mock adapter.
 */
export function isBscConfigured(): boolean {
  return !!process.env.BSC_RPC_PRIMARY?.trim();
}
