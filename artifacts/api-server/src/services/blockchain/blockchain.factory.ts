// ── Withdrawal Blockchain Gateway Factory ─────────────────────────────────────
//
// Singleton factory that vends the correct IWithdrawalGateway implementation
// for each withdrawal network.
//
// Configured at startup from environment variables — no state mutated after init.

import { getBscConfig, isBscConfigured } from "../../deposit-verification/adapter/bsc/bsc-config";
import { BscWithdrawalGateway } from "./bsc-withdrawal.service";
import { GatewayNotConfiguredError } from "./blockchain.interface";
import type { IWithdrawalGateway } from "./blockchain.interface";
import type { WithdrawalGatewayNetwork } from "./blockchain.types";
import { logger } from "../../lib/logger";

// ── Singleton registry ────────────────────────────────────────────────────────

const _registry = new Map<WithdrawalGatewayNetwork, IWithdrawalGateway>();
let _initialized = false;

function initOnce(): void {
  if (_initialized) return;
  _initialized = true;

  const dryRun     = process.env["BLOCKCHAIN_DRY_RUN"] !== "false"; // default true
  const hotWallet  = process.env["HOT_WALLET_ADDRESS"] ?? null;

  if (isBscConfigured()) {
    const config  = getBscConfig();
    const gateway = new BscWithdrawalGateway(config, hotWallet, dryRun);
    _registry.set("BEP20", gateway);

    logger.info(
      {
        network:         "BEP20",
        chainId:         config.chainId,
        hotWallet:       hotWallet ? `${hotWallet.slice(0, 8)}…` : "NOT SET",
        dryRun,
        providers:       config.rpcProviders.length,
      },
      "WithdrawalGatewayFactory: BscWithdrawalGateway registered",
    );
  } else {
    logger.warn(
      "WithdrawalGatewayFactory: BSC_RPC_PRIMARY not set — BEP20 withdrawal gateway unavailable",
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the withdrawal gateway for a specific network.
 * Throws GatewayNotConfiguredError if the network is not registered.
 */
export function getWithdrawalGateway(network: WithdrawalGatewayNetwork): IWithdrawalGateway {
  initOnce();
  const gw = _registry.get(network);
  if (!gw) throw new GatewayNotConfiguredError(network);
  return gw;
}

/**
 * Returns true if the gateway for the given network is registered.
 */
export function isGatewayConfigured(network: WithdrawalGatewayNetwork): boolean {
  initOnce();
  return _registry.has(network);
}

/**
 * Returns all registered gateways (for health checks).
 */
export function getAllGateways(): IWithdrawalGateway[] {
  initOnce();
  return [..._registry.values()];
}
