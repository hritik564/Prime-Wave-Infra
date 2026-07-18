import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Ledger Service — Sprint 31F ───────────────────────────────────────────────
//
// Append-only financial ledger. Every wallet balance change must create a
// corresponding entry here. Entries are NEVER edited or deleted — corrections
// are separate MANUAL_ADJUSTMENT entries.
//
// Usage (fire-and-forget, safe to call after any balance change):
//
//   void writeLedgerEntry({ ... }).catch(err =>
//     logger.error({ err }, "ledger: write failed")
//   );

export type LedgerTxType =
  | "DEPOSIT"
  | "INVESTMENT"
  | "ROI"
  | "LEVEL_INCOME"
  | "MATCHING_BONUS"
  | "ORBIT_INCOME"
  | "SALARY_INCOME"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "WITHDRAWAL_REQUEST"
  | "WITHDRAWAL_BROADCAST"
  | "WITHDRAWAL_COMPLETED"
  | "WITHDRAWAL_REFUND"
  | "WITHDRAWAL_CANCELLATION"
  | "MANUAL_ADJUSTMENT";

export type LedgerWallet =
  | "DEPOSIT_WALLET"
  | "INCOME_WALLET"
  | "WITHDRAWAL_WALLET"
  | "LOCKED_BALANCE";

export interface LedgerEntryInput {
  referenceId:      string;
  referenceType:    string;
  memberId:         string;
  username:         string;
  transactionType:  LedgerTxType;
  amount:           Prisma.Decimal | number | string;
  currency?:        string;
  debitCredit:      "DEBIT" | "CREDIT";
  walletType:       LedgerWallet;
  /** Balance of the target wallet AFTER this operation */
  closingBalance:   Prisma.Decimal | number | string;
  blockchainTxHash?: string;
  withdrawalId?:     string;
  investmentId?:     string;
  metadata?:         Record<string, unknown>;
}

/** Write a single ledger entry. Safe to call fire-and-forget. */
export async function writeLedgerEntry(input: LedgerEntryInput): Promise<void> {
  const amount   = new Prisma.Decimal(String(input.amount));
  const closing  = new Prisma.Decimal(String(input.closingBalance));
  const opening  = input.debitCredit === "CREDIT"
    ? closing.minus(amount)
    : closing.plus(amount);

  await prisma.financialLedger.create({
    data: {
      referenceId:      input.referenceId,
      referenceType:    input.referenceType,
      memberId:         input.memberId,
      username:         input.username,
      transactionType:  input.transactionType,
      amount,
      currency:         input.currency ?? "USDT",
      debitCredit:      input.debitCredit,
      walletType:       input.walletType,
      openingBalance:   opening,
      closingBalance:   closing,
      blockchainTxHash: input.blockchainTxHash,
      withdrawalId:     input.withdrawalId,
      investmentId:     input.investmentId,
      metadata:         input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Write multiple ledger entries in a single insert batch. */
export async function batchWriteLedgerEntries(
  inputs: LedgerEntryInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  await Promise.all(inputs.map((e) => writeLedgerEntry(e)));
}

// ── Aggregate summary ─────────────────────────────────────────────────────────

export interface LedgerTypeSummary {
  type:   string;
  credit: string;
  debit:  string;
  count:  number;
}

export interface LedgerSummary {
  totalEntries:    number;
  byType:          LedgerTypeSummary[];
  totalDeposits:   string;
  totalInvestments: string;
  totalRoi:        string;
  totalBonuses:    string;
  totalWithdrawalsRequested: string;
  totalWithdrawalsCompleted: string;
  totalWithdrawalsRefunded:  string;
  totalSalary:     string;
  totalLevelIncome: string;
  totalMatchingBonus: string;
  totalOrbitIncome: string;
  totalTransferOut: string;
  totalTransferIn: string;
  totalManualAdjustment: string;
  computedAt:      string;
}

export async function getLedgerSummary(): Promise<LedgerSummary> {
  const [totalEntries, byTypeRaw] = await Promise.all([
    prisma.financialLedger.count(),
    prisma.financialLedger.groupBy({
      by:     ["transactionType", "debitCredit"],
      _sum:   { amount: true },
      _count: { id: true },
    }),
  ]);

  // Roll up into a per-type map
  const map = new Map<string, { credit: Prisma.Decimal; debit: Prisma.Decimal; count: number }>();
  for (const row of byTypeRaw) {
    const key = row.transactionType;
    const cur = map.get(key) ?? { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0), count: 0 };
    const sum = new Prisma.Decimal(String(row._sum.amount ?? 0));
    if (row.debitCredit === "CREDIT") cur.credit = cur.credit.plus(sum);
    else                               cur.debit  = cur.debit.plus(sum);
    cur.count += row._count.id;
    map.set(key, cur);
  }

  const byType: LedgerTypeSummary[] = Array.from(map.entries()).map(([type, v]) => ({
    type,
    credit: v.credit.toFixed(2),
    debit:  v.debit.toFixed(2),
    count:  v.count,
  }));

  const get = (key: string) => (map.get(key) ?? { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0) });

  return {
    totalEntries,
    byType,
    totalDeposits:             get("DEPOSIT").credit.toFixed(2),
    totalInvestments:          get("INVESTMENT").debit.toFixed(2),
    totalRoi:                  get("ROI").credit.toFixed(2),
    totalBonuses:              [
      get("MATCHING_BONUS").credit,
      get("ORBIT_INCOME").credit,
    ].reduce((a, b) => a.plus(b), new Prisma.Decimal(0)).toFixed(2),
    totalWithdrawalsRequested: get("WITHDRAWAL_REQUEST").debit.toFixed(2),
    totalWithdrawalsCompleted: get("WITHDRAWAL_COMPLETED").debit.toFixed(2),
    totalWithdrawalsRefunded:  get("WITHDRAWAL_REFUND").credit.toFixed(2),
    totalSalary:               get("SALARY_INCOME").credit.toFixed(2),
    totalLevelIncome:          get("LEVEL_INCOME").credit.toFixed(2),
    totalMatchingBonus:        get("MATCHING_BONUS").credit.toFixed(2),
    totalOrbitIncome:          get("ORBIT_INCOME").credit.toFixed(2),
    totalTransferOut:          get("TRANSFER_OUT").debit.toFixed(2),
    totalTransferIn:           get("TRANSFER_IN").credit.toFixed(2),
    totalManualAdjustment:     get("MANUAL_ADJUSTMENT").credit.minus(get("MANUAL_ADJUSTMENT").debit).toFixed(2),
    computedAt:                new Date().toISOString(),
  };
}

// ── Paginated query ───────────────────────────────────────────────────────────

export interface LedgerEntryRow {
  id:              string;
  referenceId:     string;
  referenceType:   string;
  memberId:        string;
  username:        string;
  transactionType: string;
  amount:          string;
  currency:        string;
  debitCredit:     string;
  walletType:      string;
  openingBalance:  string;
  closingBalance:  string;
  blockchainTxHash: string | null;
  withdrawalId:    string | null;
  investmentId:    string | null;
  metadata:        Record<string, unknown> | null;
  createdAt:       string;
}

export interface LedgerPage {
  entries: LedgerEntryRow[];
  total:   number;
  page:    number;
  limit:   number;
  pages:   number;
}

export async function getLedgerEntries(opts: {
  page?:            number;
  limit?:           number;
  memberId?:        string;
  transactionType?: string;
  debitCredit?:     string;
  walletType?:      string;
  from?:            Date;
  to?:              Date;
  search?:          string;
}): Promise<LedgerPage> {
  const page  = Math.max(1, opts.page  ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const skip  = (page - 1) * limit;

  const where: Prisma.FinancialLedgerWhereInput = {};
  if (opts.memberId)        where.memberId        = opts.memberId;
  if (opts.transactionType) where.transactionType = opts.transactionType as never;
  if (opts.debitCredit)     where.debitCredit     = opts.debitCredit as never;
  if (opts.walletType)      where.walletType      = opts.walletType as never;
  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = opts.from;
    if (opts.to)   where.createdAt.lte = opts.to;
  }
  if (opts.search) {
    where.OR = [
      { username:        { contains: opts.search, mode: "insensitive" } },
      { referenceId:     { contains: opts.search, mode: "insensitive" } },
      { withdrawalId:    { contains: opts.search, mode: "insensitive" } },
      { blockchainTxHash: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [entries, total] = await Promise.all([
    prisma.financialLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
    }),
    prisma.financialLedger.count({ where }),
  ]);

  return {
    entries: entries.map((e) => ({
      id:               e.id,
      referenceId:      e.referenceId,
      referenceType:    e.referenceType,
      memberId:         e.memberId,
      username:         e.username,
      transactionType:  e.transactionType,
      amount:           e.amount.toFixed(8),
      currency:         e.currency,
      debitCredit:      e.debitCredit,
      walletType:       e.walletType,
      openingBalance:   e.openingBalance.toFixed(8),
      closingBalance:   e.closingBalance.toFixed(8),
      blockchainTxHash: e.blockchainTxHash,
      withdrawalId:     e.withdrawalId,
      investmentId:     e.investmentId,
      metadata:         e.metadata as Record<string, unknown> | null,
      createdAt:        e.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

// ── Wallet totals from ledger ─────────────────────────────────────────────────

export interface LedgerWalletTotals {
  depositWallet:    { credits: string; debits: string; net: string };
  incomeWallet:     { credits: string; debits: string; net: string };
  withdrawalWallet: { credits: string; debits: string; net: string };
  lockedBalance:    { credits: string; debits: string; net: string };
}

export async function getLedgerWalletTotals(): Promise<LedgerWalletTotals> {
  const rows = await prisma.financialLedger.groupBy({
    by:   ["walletType", "debitCredit"],
    _sum: { amount: true },
  });

  const agg: Record<string, { credit: Prisma.Decimal; debit: Prisma.Decimal }> = {
    DEPOSIT_WALLET:    { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0) },
    INCOME_WALLET:     { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0) },
    WITHDRAWAL_WALLET: { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0) },
    LOCKED_BALANCE:    { credit: new Prisma.Decimal(0), debit: new Prisma.Decimal(0) },
  };

  for (const r of rows) {
    const key = r.walletType;
    const sum = new Prisma.Decimal(String(r._sum.amount ?? 0));
    if (agg[key]) {
      if (r.debitCredit === "CREDIT") agg[key]!.credit = agg[key]!.credit.plus(sum);
      else                             agg[key]!.debit  = agg[key]!.debit.plus(sum);
    }
  }

  const fmt = (wt: string) => ({
    credits: agg[wt]!.credit.toFixed(2),
    debits:  agg[wt]!.debit.toFixed(2),
    net:     agg[wt]!.credit.minus(agg[wt]!.debit).toFixed(2),
  });

  return {
    depositWallet:    fmt("DEPOSIT_WALLET"),
    incomeWallet:     fmt("INCOME_WALLET"),
    withdrawalWallet: fmt("WITHDRAWAL_WALLET"),
    lockedBalance:    fmt("LOCKED_BALANCE"),
  };
}

// ── CSV export ────────────────────────────────────────────────────────────────

/** Fetch ALL ledger entries matching filters (no pagination) for CSV export. */
export async function getAllLedgerEntriesForExport(opts: {
  from?: Date;
  to?:   Date;
  transactionType?: string;
  memberId?: string;
}): Promise<LedgerEntryRow[]> {
  const where: Prisma.FinancialLedgerWhereInput = {};
  if (opts.memberId)        where.memberId        = opts.memberId;
  if (opts.transactionType) where.transactionType = opts.transactionType as never;
  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = opts.from;
    if (opts.to)   where.createdAt.lte = opts.to;
  }

  const entries = await prisma.financialLedger.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    100_000, // safety cap
  });

  logger.info({ count: entries.length }, "ledger: exporting entries");

  return entries.map((e) => ({
    id:               e.id,
    referenceId:      e.referenceId,
    referenceType:    e.referenceType,
    memberId:         e.memberId,
    username:         e.username,
    transactionType:  e.transactionType,
    amount:           e.amount.toFixed(8),
    currency:         e.currency,
    debitCredit:      e.debitCredit,
    walletType:       e.walletType,
    openingBalance:   e.openingBalance.toFixed(8),
    closingBalance:   e.closingBalance.toFixed(8),
    blockchainTxHash: e.blockchainTxHash,
    withdrawalId:     e.withdrawalId,
    investmentId:     e.investmentId,
    metadata:         e.metadata as Record<string, unknown> | null,
    createdAt:        e.createdAt.toISOString(),
  }));
}
