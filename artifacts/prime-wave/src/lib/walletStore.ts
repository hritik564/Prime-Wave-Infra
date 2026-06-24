/* ─────────────────────────────────────────────────────────────────────────────
   walletStore — localStorage-backed shared state for wallet balances.
   Used across InvestmentsPage, IncomeWalletPage, and DepositWalletPage.
   When auth is wired, replace these helpers with real API mutations.
───────────────────────────────────────────────────────────────────────────── */

const BASE_INCOME_BALANCE = 1280.75;

// Keys
const K_INCOME   = "pw:incomeBalance";
const K_CLAIMED  = "pw:claimedRoi";
const K_DEPOSITS = "pw:deposits";

// ── Income balance ────────────────────────────────────────────────────────────

export function getIncomeBalance(): number {
  try {
    const v = localStorage.getItem(K_INCOME);
    return v !== null ? parseFloat(v) : BASE_INCOME_BALANCE;
  } catch {
    return BASE_INCOME_BALANCE;
  }
}

export function setIncomeBalance(v: number): void {
  try { localStorage.setItem(K_INCOME, String(v)); } catch {}
}

// ── Claimed ROI per investment ────────────────────────────────────────────────

export function getClaimedRoiMap(): Record<number, number> {
  try {
    const v = localStorage.getItem(K_CLAIMED);
    return v ? (JSON.parse(v) as Record<number, number>) : {};
  } catch {
    return {};
  }
}

/**
 * Marks ROI as claimed for an investment and credits income balance.
 * Returns the updated claimed map.
 */
export function claimRoi(invId: number, amount: number): Record<number, number> {
  const map = getClaimedRoiMap();
  map[invId] = (map[invId] ?? 0) + amount;
  try { localStorage.setItem(K_CLAIMED, JSON.stringify(map)); } catch {}
  setIncomeBalance(getIncomeBalance() + amount);
  return map;
}

/**
 * Returns the effective (unclaimed) ROI for an investment.
 */
export function effectiveRoi(invId: number, seedRoi: number): number {
  const claimed = getClaimedRoiMap()[invId] ?? 0;
  return Math.max(0, seedRoi - claimed);
}

// ── Pending deposits ──────────────────────────────────────────────────────────

export interface PendingDeposit {
  id: string;
  amount: number;
  network: string;
  txHash: string;
  status: "pending";
  date: string;
}

export function getPendingDeposits(): PendingDeposit[] {
  try {
    const v = localStorage.getItem(K_DEPOSITS);
    return v ? (JSON.parse(v) as PendingDeposit[]) : [];
  } catch {
    return [];
  }
}

export function addPendingDeposit(
  deposit: Pick<PendingDeposit, "amount" | "network" | "txHash">,
): PendingDeposit {
  const item: PendingDeposit = {
    id: String(Date.now()),
    ...deposit,
    status: "pending",
    date: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  };
  const all = getPendingDeposits();
  all.unshift(item);
  try { localStorage.setItem(K_DEPOSITS, JSON.stringify(all)); } catch {}
  return item;
}
