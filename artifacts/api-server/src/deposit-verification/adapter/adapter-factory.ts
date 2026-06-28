import type { DepositNetwork } from "@prisma/client";
import type { IBlockchainAdapter } from "./blockchain-adapter.interface";
import { MockBlockchainAdapter } from "./mock-blockchain-adapter";

// ── Adapter registry ──────────────────────────────────────────────────────────
//
// Sprint 25A: MockBlockchainAdapter handles all networks (test-only).
// Sprint 25B: Replace with BSCBlockchainAdapter for BEP20.
//
// To swap in a real adapter:
//   1. Implement IBlockchainAdapter for BSC.
//   2. Register it below for "BEP20".
//   3. Remove (or keep) the mock for other networks / dev environments.

const registry = new Map<DepositNetwork, IBlockchainAdapter>();

function registerAdapters(): void {
  const mock = new MockBlockchainAdapter();
  // Register mock for every network until real adapters are built.
  for (const network of ["BEP20", "ERC20", "TRC20", "SOL"] as DepositNetwork[]) {
    registry.set(network, mock);
  }
}

registerAdapters();

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
