// ── Blockchain Adapter Registry ───────────────────────────────────────────────
//
// Sprint 25A: MockBlockchainAdapter — deterministic, prefix-driven (dev/test)
// Sprint 25B: BSCBlockchainAdapter  — production BNB Smart Chain JSON-RPC
//
// Adapter selection:
//   BSC_RPC_PRIMARY set  → BSCBlockchainAdapter for BEP20 (production)
//   BSC_RPC_PRIMARY unset → MockBlockchainAdapter for BEP20 (dev fallback)
//
// To add a new network adapter (Sprint 25C+):
//   1. Implement IBlockchainAdapter.
//   2. Add its config check to isBscConfigured() or equivalent.
//   3. Register it below for the appropriate DepositNetwork key.

import type { DepositNetwork } from "@prisma/client";
import type { IBlockchainAdapter } from "./blockchain-adapter.interface";
import { MockBlockchainAdapter } from "./mock-blockchain-adapter";
import { BSCBlockchainAdapter } from "./bsc/bsc-blockchain-adapter";
import { getBscConfig, isBscConfigured } from "./bsc/bsc-config";
import { logger } from "../../lib/logger";

// ── Registry ──────────────────────────────────────────────────────────────────

const registry = new Map<DepositNetwork, IBlockchainAdapter>();

function registerAdapters(): void {
  if (isBscConfigured()) {
    const config     = getBscConfig();
    const bscAdapter = new BSCBlockchainAdapter(config);
    registry.set("BEP20", bscAdapter);

    logger.info(
      {
        network:               "BEP20",
        providers:             config.rpcProviders.length,
        chainId:               config.chainId,
        requiredConfirmations: config.requiredConfirmations,
        usdtContract:          config.usdtContractAddress,
      },
      "BlockchainAdapterFactory: BSCBlockchainAdapter registered (production)",
    );
  } else {
    const mock = new MockBlockchainAdapter();
    registry.set("BEP20", mock);

    logger.warn(
      "BlockchainAdapterFactory: BSC_RPC_PRIMARY not set — " +
      "MockBlockchainAdapter active for BEP20 (development only, not for production)",
    );
  }
}

registerAdapters();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the blockchain adapter registered for the given network.
 * Throws if no adapter is registered (should never happen after Sprint 25A).
 */
export function getAdapter(network: DepositNetwork): IBlockchainAdapter {
  const adapter = registry.get(network);
  if (!adapter) {
    throw new Error(`No blockchain adapter registered for network: ${network}`);
  }
  return adapter;
}

export type { IBlockchainAdapter };
