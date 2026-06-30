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

export interface WalletCheckResult {
  network:  CheckedNetwork;
  /**
   * "active"   — network has at least one wallet with a valid address format;
   *              full validation was run; `passed` reflects the outcome.
   * "inactive" — no wallets exist for this network, or every configured wallet
   *              has a placeholder/invalid address; validation was skipped;
   *              `passed` is always true and must not block startup.
   */
  kind:     "active" | "inactive";
  passed:   boolean;
  address?: string;
  issue?:   string;
}

// ── Public validation function ────────────────────────────────────────────────

/**
 * Validates company wallets for every known network.
 *
 * A network is considered ACTIVE if it has at least one `isActive = true`
 * wallet with a real (non-placeholder) address.  Only ACTIVE networks are
 * fully validated, and only ACTIVE failures set `passed = false` on the
 * returned top-level flag.
 *
 * Inactive networks (no active wallets, or every active wallet is a
 * placeholder) are silently skipped — they never block startup.
 *
 * Active network validation checks:
 *   ✓ exactly one active wallet
 *   ✓ wallet exists
 *   ✓ address format is valid
 *   ✓ not a placeholder address
 *   ✓ no duplicate active wallets
 *
 * Does NOT throw — callers decide whether to abort startup based on the
 * `passed` flag and each result's `kind`.
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
      // DB failure counts as an active-network failure so startup can surface it.
      results.push({
        network,
        kind:   "active",
        passed: false,
        issue:  `DB query failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    // ── Determine active vs inactive ──────────────────────────────────────────
    // A network is INACTIVE when it has no active wallet rows, or every row
    // holds a placeholder/invalid address.  Inactive networks are skipped.
    const hasRealAddress = wallets.some((w) => isValidWalletFormat(w.walletAddress, network));

    if (wallets.length === 0 || !hasRealAddress) {
      results.push({ network, kind: "inactive", passed: true });
      continue;
    }

    // ── Full validation for ACTIVE networks ───────────────────────────────────

    if (wallets.length > 1) {
      results.push({
        network,
        kind:   "active",
        passed: false,
        issue:  `Multiple active wallets configured (${wallets.length}) — only one is allowed`,
      });
      continue;
    }

    const address = wallets[0].walletAddress;

    if (!isValidWalletFormat(address, network)) {
      // Guarded above by hasRealAddress, but kept for completeness.
      results.push({
        network,
        kind:    "active",
        passed:  false,
        address,
        issue:   "Address format is invalid or placeholder — real wallet address required",
      });
      continue;
    }

    results.push({ network, kind: "active", passed: true, address });
  }

  // Top-level flag: only ACTIVE network failures count.
  const passed = results.every((r) => r.kind === "inactive" || r.passed);
  return { passed, results };
}
