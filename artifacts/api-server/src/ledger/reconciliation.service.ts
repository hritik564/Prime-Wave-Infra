import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { getLedgerWalletTotals } from "./ledger.service";

// ── Reconciliation Service — Sprint 31F ───────────────────────────────────────
//
// Compares the financial ledger against actual wallet balances and
// blockchain records to detect inconsistencies.
//
// NEVER modifies any data. Read-only reconciliation only.

export interface ReconciliationDiscrepancy {
  type:        string;
  severity:    "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  metadata?:   Record<string, unknown>;
}

export interface WalletReconciliation {
  userId:             string;
  depositWallet:      string;
  incomeWallet:       string;
  withdrawalWallet:   string;
  lockedBalance:      string;
  hasNegative:        boolean;
  negativeFields:     string[];
}

export interface BlockchainReconciliation {
  totalCompletedWithdrawals:     number;
  totalCompletedAmount:          string;
  totalConfirmingWithdrawals:    number;
  duplicateTxHashes:             number;
  orphanedConfirming:            number;    // CONFIRMING with no txHash
  stuckProcessing:               number;    // PROCESSING/SIGNED/BROADCASTING > 2h
  missingExplorerUrl:            number;    // COMPLETED with no explorerUrl
}

export interface LedgerReconciliation {
  ledgerDepositTotal:      string;
  ledgerInvestmentTotal:   string;
  ledgerWithdrawalTotal:   string;
  ledgerBonusTotal:        string;
  dbDepositTotal:          string;
  dbInvestmentTotal:       string;
  dbWithdrawalTotal:       string;
  depositDelta:            string;
  investmentDelta:         string;
  withdrawalDelta:         string;
  ledgerEntryCount:        number;
  walletTransactionCount:  number;
}

export interface ReconciliationResult {
  runAt:             string;
  status:            "OK" | "DISCREPANCIES_FOUND";
  durationMs:        number;
  discrepancies:     ReconciliationDiscrepancy[];
  wallets:           WalletReconciliation[];
  blockchain:        BlockchainReconciliation;
  ledger:            LedgerReconciliation;
  summary: {
    totalUsers:           number;
    negativeBalanceUsers: number;
    openDiscrepancies:    number;
  };
}

export async function runReconciliation(): Promise<ReconciliationResult> {
  const start = Date.now();
  const runAt = new Date().toISOString();
  const discrepancies: ReconciliationDiscrepancy[] = [];

  logger.info("reconciliation: starting run");

  // ── 1. Load all wallet balances ──────────────────────────────────────────────
  const wallets = await prisma.wallet.findMany({
    select: {
      userId:                  true,
      depositWallet:           true,
      incomeWallet:            true,
      withdrawalWallet:        true,
      lockedWithdrawalBalance: true,
    },
  });

  const walletRecs: WalletReconciliation[] = [];
  let negativeBalanceUsers = 0;

  for (const w of wallets) {
    const negativeFields: string[] = [];
    if (w.depositWallet.lt(0))           negativeFields.push("depositWallet");
    if (w.incomeWallet.lt(0))            negativeFields.push("incomeWallet");
    if (w.withdrawalWallet.lt(0))        negativeFields.push("withdrawalWallet");
    if (w.lockedWithdrawalBalance.lt(0)) negativeFields.push("lockedWithdrawalBalance");

    if (negativeFields.length > 0) {
      negativeBalanceUsers++;
      discrepancies.push({
        type:        "NEGATIVE_BALANCE",
        severity:    "CRITICAL",
        description: `User ${w.userId} has negative balance(s): ${negativeFields.join(", ")}`,
        metadata:    {
          userId:    w.userId,
          fields:    negativeFields,
          balances: {
            depositWallet:    w.depositWallet.toFixed(8),
            incomeWallet:     w.incomeWallet.toFixed(8),
            withdrawalWallet: w.withdrawalWallet.toFixed(8),
            lockedBalance:    w.lockedWithdrawalBalance.toFixed(8),
          },
        },
      });
    }

    walletRecs.push({
      userId:            w.userId,
      depositWallet:     w.depositWallet.toFixed(8),
      incomeWallet:      w.incomeWallet.toFixed(8),
      withdrawalWallet:  w.withdrawalWallet.toFixed(8),
      lockedBalance:     w.lockedWithdrawalBalance.toFixed(8),
      hasNegative:       negativeFields.length > 0,
      negativeFields,
    });
  }

  // ── 2. Blockchain reconciliation ─────────────────────────────────────────────
  const stuckCutoff     = new Date(Date.now() - 2 * 60 * 60 * 1_000);
  const orphanCutoff    = new Date(Date.now() - 30 * 60 * 1_000);

  const [
    completedWithdrawals,
    confirmingWithdrawals,
    duplicateTxRaw,
    orphanedConfirming,
    stuckProcessing,
    missingExplorerUrl,
  ] = await Promise.all([
    prisma.withdrawalRequest.aggregate({
      where: { status: "COMPLETED" },
      _sum:  { netAmount: true },
      _count: { id: true },
    }),
    prisma.withdrawalRequest.count({ where: { status: "CONFIRMING" } }),
    prisma.$queryRaw<Array<{ txHash: string; count: bigint }>>`
      SELECT "txHash", COUNT(*) AS count
      FROM withdrawal_requests
      WHERE "txHash" IS NOT NULL
      GROUP BY "txHash"
      HAVING COUNT(*) > 1
    `,
    prisma.withdrawalRequest.count({
      where: { status: "CONFIRMING", txHash: null, createdAt: { lte: orphanCutoff } },
    }),
    prisma.withdrawalRequest.count({
      where: {
        status: { in: ["PROCESSING", "SIGNED", "BROADCASTING"] },
        updatedAt: { lte: stuckCutoff },
      },
    }),
    prisma.withdrawalRequest.count({
      where: { status: "COMPLETED", explorerUrl: null },
    }),
  ]);

  const dupCount = duplicateTxRaw.length;
  if (dupCount > 0) {
    discrepancies.push({
      type:     "DUPLICATE_TX_HASH",
      severity: "CRITICAL",
      description: `${dupCount} withdrawal(s) share duplicate txHash values`,
      metadata: { duplicates: duplicateTxRaw.map((r) => ({ txHash: r.txHash, count: Number(r.count) })) },
    });
  }
  if (orphanedConfirming > 0) {
    discrepancies.push({
      type:     "ORPHANED_CONFIRMING",
      severity: "HIGH",
      description: `${orphanedConfirming} withdrawal(s) are CONFIRMING with no txHash (>30 min)`,
    });
  }
  if (stuckProcessing > 0) {
    discrepancies.push({
      type:     "STUCK_PROCESSING",
      severity: "HIGH",
      description: `${stuckProcessing} withdrawal(s) have been PROCESSING/SIGNED/BROADCASTING for >2 hours`,
    });
  }

  const blockchain: BlockchainReconciliation = {
    totalCompletedWithdrawals:   completedWithdrawals._count.id,
    totalCompletedAmount:        (completedWithdrawals._sum.netAmount ?? new Prisma.Decimal(0)).toFixed(2),
    totalConfirmingWithdrawals:  confirmingWithdrawals,
    duplicateTxHashes:           dupCount,
    orphanedConfirming,
    stuckProcessing,
    missingExplorerUrl,
  };

  // ── 3. Ledger vs DB reconciliation ──────────────────────────────────────────
  const [
    ledgerTotals,
    dbDepositAgg,
    dbInvestmentAgg,
    dbWithdrawalAgg,
    ledgerEntryCount,
    walletTxCount,
  ] = await Promise.all([
    getLedgerWalletTotals(),
    prisma.depositRequest.aggregate({
      where: { status: "APPROVED" },
      _sum:  { amount: true },
    }),
    prisma.investment.aggregate({
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: "COMPLETED" },
      _sum:  { netAmount: true },
    }),
    prisma.financialLedger.count(),
    prisma.walletTransaction.count(),
  ]);

  const dbDepositTotal     = new Prisma.Decimal(String(dbDepositAgg._sum.amount     ?? 0));
  const dbInvestmentTotal  = new Prisma.Decimal(String(dbInvestmentAgg._sum.amount  ?? 0));
  const dbWithdrawalTotal  = new Prisma.Decimal(String(dbWithdrawalAgg._sum.netAmount ?? 0));
  const ledgerDepositTotal = new Prisma.Decimal(ledgerTotals.depositWallet.credits);

  // Check if ledger has meaningful entries before flagging mismatch
  if (ledgerEntryCount > 0) {
    const depositDelta = dbDepositTotal.minus(ledgerDepositTotal).abs();
    if (depositDelta.gt(1)) {
      discrepancies.push({
        type:     "LEDGER_DEPOSIT_MISMATCH",
        severity: "HIGH",
        description: `Ledger deposit credits ($${ledgerDepositTotal.toFixed(2)}) differ from approved deposits ($${dbDepositTotal.toFixed(2)}) by $${depositDelta.toFixed(2)}`,
        metadata:  { dbTotal: dbDepositTotal.toFixed(2), ledgerTotal: ledgerDepositTotal.toFixed(2), delta: depositDelta.toFixed(2) },
      });
    }
  }

  const ledger: LedgerReconciliation = {
    ledgerDepositTotal:     ledgerTotals.depositWallet.credits,
    ledgerInvestmentTotal:  ledgerTotals.depositWallet.debits,
    ledgerWithdrawalTotal:  ledgerTotals.withdrawalWallet.debits,
    ledgerBonusTotal:       (
      new Prisma.Decimal(ledgerTotals.withdrawalWallet.credits)
    ).toFixed(2),
    dbDepositTotal:         dbDepositTotal.toFixed(2),
    dbInvestmentTotal:      dbInvestmentTotal.toFixed(2),
    dbWithdrawalTotal:      dbWithdrawalTotal.toFixed(2),
    depositDelta:           dbDepositTotal.minus(ledgerDepositTotal).toFixed(2),
    investmentDelta:        dbInvestmentTotal.minus(new Prisma.Decimal(ledgerTotals.depositWallet.debits)).toFixed(2),
    withdrawalDelta:        dbWithdrawalTotal.minus(new Prisma.Decimal(ledgerTotals.withdrawalWallet.debits)).toFixed(2),
    ledgerEntryCount,
    walletTransactionCount: walletTxCount,
  };

  // ── 4. Open discrepancy count ─────────────────────────────────────────────────
  const openDiscrepancies = await prisma.financialDiscrepancy.count({
    where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
  });

  const durationMs = Date.now() - start;
  const status: "OK" | "DISCREPANCIES_FOUND" = discrepancies.length > 0 ? "DISCREPANCIES_FOUND" : "OK";

  logger.info(
    { status, discrepancyCount: discrepancies.length, durationMs },
    "reconciliation: complete",
  );

  return {
    runAt,
    status,
    durationMs,
    discrepancies,
    wallets: walletRecs,
    blockchain,
    ledger,
    summary: {
      totalUsers:           wallets.length,
      negativeBalanceUsers,
      openDiscrepancies,
    },
  };
}

/** Run reconciliation, persist the report, and save new discrepancies. */
export async function runAndSaveReconciliation(opts?: {
  isManual?:    boolean;
  triggeredBy?: string;
}): Promise<ReconciliationResult> {
  const result = await runReconciliation();

  // Persist report
  await prisma.reconciliationReport.create({
    data: {
      runAt:           new Date(result.runAt),
      status:          result.status,
      discrepancyCount: result.discrepancies.length,
      isManual:        opts?.isManual ?? false,
      triggeredBy:     opts?.triggeredBy,
      summary: {
        durationMs:          result.durationMs,
        negativeBalances:    result.summary.negativeBalanceUsers,
        blockchainStatus:    result.blockchain as unknown,
        ledgerStatus:        result.ledger    as unknown,
        discrepancies:       result.discrepancies as unknown[],
      } as unknown as Prisma.InputJsonValue,
    },
  });

  // Persist new discrepancies (don't duplicate — check by type+description)
  for (const d of result.discrepancies) {
    const existing = await prisma.financialDiscrepancy.findFirst({
      where: {
        type:        d.type,
        status:      { in: ["OPEN", "UNDER_REVIEW"] },
        description: { contains: d.type },
      },
    });
    if (!existing) {
      await prisma.financialDiscrepancy.create({
        data: {
          type:        d.type,
          severity:    d.severity,
          description: d.description,
          metadata:    d.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    }
  }

  return result;
}

/** List saved reconciliation reports. */
export async function getReconciliationReports(limit = 20) {
  return prisma.reconciliationReport.findMany({
    orderBy: { runAt: "desc" },
    take:    limit,
    select: {
      id:               true,
      runAt:            true,
      status:           true,
      discrepancyCount: true,
      isManual:         true,
      triggeredBy:      true,
      createdAt:        true,
    },
  });
}
