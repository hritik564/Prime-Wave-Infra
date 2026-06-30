import { prisma } from "./config/prisma";
import { logger } from "./lib/logger";

// ── Networks checked at startup ───────────────────────────────────────────────

const CHECKED_NETWORKS = ["BEP20", "ERC20", "TRC20", "SOL"] as const;
type CheckedNetwork = (typeof CHECKED_NETWORKS)[number];

// ── Address format validation ─────────────────────────────────────────────────

function isValidWalletFormat(address: string, network: CheckedNetwork): boolean {
  switch (network) {
    case "BEP20":
    case "ERC20":
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    case "TRC20":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
    case "SOL":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    default:
      return false;
  }
}

// ── Per-network result ────────────────────────────────────────────────────────

interface WalletCheckResult {
  network:  CheckedNetwork;
  passed:   boolean;
  address?: string;
  issue?:   string;
}

// ── Public validation function ────────────────────────────────────────────────

/**
 * Validates every active company wallet in the database.
 *
 * For each network checks:
 *   ✓ exactly one active wallet exists
 *   ✓ address format is valid (not a placeholder)
 *
 * Returns a structured report. Does NOT throw — callers decide whether to
 * abort startup based on the `passed` flag.
 */
export async function validateCompanyWallets(): Promise<{
  passed:  boolean;
  results: WalletCheckResult[];
}> {
  const results: WalletCheckResult[] = [];

  for (const network of CHECKED_NETWORKS) {
    let wallets: { walletAddress: string }[];

    try {
      wallets = await prisma.companyWallet.findMany({
        where:  { network, isActive: true },
        select: { walletAddress: true },
      });
    } catch (err) {
      results.push({ network, passed: false, issue: `DB query failed: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    if (wallets.length === 0) {
      results.push({ network, passed: false, issue: "No active wallet configured" });
      continue;
    }

    if (wallets.length > 1) {
      results.push({ network, passed: false, issue: `Multiple active wallets configured (${wallets.length}) — only one is allowed` });
      continue;
    }

    const address = wallets[0].walletAddress;

    if (!isValidWalletFormat(address, network)) {
      results.push({
        network,
        passed:  false,
        address,
        issue:   "Address format is invalid or placeholder — real wallet address required",
      });
      continue;
    }

    results.push({ network, passed: true, address });
  }

  const passed = results.every((r) => r.passed);
  return { passed, results };
}
