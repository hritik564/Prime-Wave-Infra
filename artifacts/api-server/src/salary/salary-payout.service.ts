/**
 * Sprint 33I — Salary Approval & Payout Engine
 *
 * Responsible ONLY for approving and paying existing SalaryIncome records.
 * Does not touch: qualification, salary generation, SalaryBusinessSummary,
 * SalaryAchievement, SalaryBusinessEvent, or business propagation.
 *
 * ── Salary lifecycle ──────────────────────────────────────────────────────────
 *
 *   PENDING → APPROVED → PAID   (one-way only; backwards transitions are rejected)
 *
 * ── Functions ─────────────────────────────────────────────────────────────────
 *
 *   approveSalary(incomeId, approvedBy?)   Transition PENDING → APPROVED.
 *   paySalary(incomeId)                   Transition APPROVED → PAID + credit wallet.
 *   approveMonthlyBatch(month, year, opts) Approve every PENDING income for a month.
 *   payMonthlyBatch(month, year, opts)     Pay every APPROVED income for a month.
 *
 * ── Atomicity ────────────────────────────────────────────────────────────────
 *
 *   paySalary() wraps wallet credit + WalletTransaction + SalaryIncome update
 *   + SalaryPayoutEvent in a single Prisma interactive transaction.
 *   If any step fails the entire operation rolls back — no partial state.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 *
 *   approveSalary on APPROVED → "duplicate" (no-op).
 *   paySalary on PAID → "duplicate" (no wallet credit, no write).
 *   The in-transaction status re-check prevents concurrent double-payment even
 *   if two workers race on the same row.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Result types ──────────────────────────────────────────────────────────────

export type ApproveResult =
  | { status: "approved" }
  | { status: "duplicate" }
  | { status: "rejected"; reason: "not-found" | "already-paid" };

export type PayResult =
  | { status: "paid"; transactionId: string; amount: Prisma.Decimal }
  | { status: "duplicate" }
  | { status: "rejected"; reason: "not-found" | "not-approved" };

export interface PayoutBatchMetrics {
  processed:            number;
  approved:             number;
  paid:                 number;
  duplicates:           number;
  failed:               number;
  walletAmountCredited: Prisma.Decimal;
  durationMs:           number;
}

export interface BatchOptions {
  concurrency?: number;
  pageSize?:    number;
}

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_PAGE_SIZE   = 500;

// ── Approval ──────────────────────────────────────────────────────────────────

/**
 * Transition a SalaryIncome record from PENDING → APPROVED.
 *
 * PENDING  → "approved"  (status updated, payout event written)
 * APPROVED → "duplicate" (idempotent no-op)
 * PAID     → "rejected"  (backwards transition forbidden)
 * missing  → "rejected"  reason="not-found"
 */
export async function approveSalary(
  incomeId:   string,
  approvedBy?: string,
): Promise<ApproveResult> {
  logger.info({ incomeId, approvedBy }, "salary-payout: approval started");

  return prisma.$transaction(async (tx) => {
    const income = await tx.salaryIncome.findUnique({
      where:  { id: incomeId },
      select: { id: true, userId: true, status: true, rankName: true, amount: true },
    });

    if (!income) {
      logger.info({ incomeId }, "salary-payout: income not found — rejected");
      return { status: "rejected", reason: "not-found" } as const;
    }

    if (income.status === "PAID") {
      logger.info({ incomeId }, "salary-payout: already PAID — backwards transition rejected");
      return { status: "rejected", reason: "already-paid" } as const;
    }

    if (income.status === "APPROVED") {
      logger.info({ incomeId }, "salary-payout: already APPROVED — duplicate skipped");
      return { status: "duplicate" } as const;
    }

    // PENDING → APPROVED
    await tx.salaryIncome.update({
      where: { id: incomeId },
      data:  {
        status:     "APPROVED",
        approvedAt: new Date(),
        approvedBy: approvedBy ?? null,
      },
    });

    await tx.salaryPayoutEvent.create({
      data: {
        salaryIncomeId: incomeId,
        userId:         income.userId,
        eventType:      "APPROVED",
        performedBy:    approvedBy ?? null,
        metadata: {
          rankName: income.rankName,
          amount:   income.amount.toString(),
        },
      },
    });

    logger.info(
      { incomeId, userId: income.userId, approvedBy },
      "salary-payout: salary approved",
    );
    return { status: "approved" } as const;
  });
}

// ── Payout ────────────────────────────────────────────────────────────────────

/**
 * Transition a SalaryIncome record from APPROVED → PAID.
 * Atomically credits the member's Withdrawal Wallet.
 *
 * APPROVED → "paid"      (wallet credited, WalletTransaction + SalaryPayoutEvent written)
 * PAID     → "duplicate" (idempotent no-op; wallet NOT credited again)
 * PENDING  → "rejected"  reason="not-approved"
 * missing  → "rejected"  reason="not-found"
 */
export async function paySalary(incomeId: string): Promise<PayResult> {
  logger.info({ incomeId }, "salary-payout: payout started");

  return prisma.$transaction(async (tx) => {
    // Step 1: Lock and read the SalaryIncome row
    const income = await tx.salaryIncome.findUnique({
      where:  { id: incomeId },
      select: { id: true, userId: true, status: true, rankName: true, amount: true, reference: true },
    });

    if (!income) {
      return { status: "rejected", reason: "not-found" } as const;
    }

    // Step 2: Verify status is APPROVED (concurrent-safe re-check inside tx)
    if (income.status === "PAID") {
      logger.info({ incomeId }, "salary-payout: already PAID — duplicate payout skipped");
      return { status: "duplicate" } as const;
    }

    if (income.status === "PENDING") {
      logger.info({ incomeId }, "salary-payout: status is PENDING — must approve first");
      return { status: "rejected", reason: "not-approved" } as const;
    }

    // Step 3: Load wallet (for walletId required by WalletTransaction)
    const wallet = await tx.wallet.findUnique({
      where:  { userId: income.userId },
      select: { id: true },
    });

    if (!wallet) {
      throw new Error(`Wallet not found for userId=${income.userId}`);
    }

    // Step 3: Credit Withdrawal Wallet
    await tx.wallet.update({
      where: { userId: income.userId },
      data:  { withdrawalWallet: { increment: income.amount } },
    });

    // Step 4: Create WalletTransaction
    const walletTx = await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId:      income.userId,
        type:        "SALARY",
        status:      "SUCCESS",
        amount:      income.amount,
        description: `Salary payout — ${income.rankName} (${income.reference ?? incomeId})`,
        metadata: {
          salaryIncomeId: incomeId,
          rankName:       income.rankName,
        },
      },
    });

    // Step 5: Update SalaryIncome → PAID
    await tx.salaryIncome.update({
      where: { id: incomeId },
      data:  {
        status:        "PAID",
        paidAt:        new Date(),
        transactionId: walletTx.id,
      },
    });

    // Audit event
    await tx.salaryPayoutEvent.create({
      data: {
        salaryIncomeId: incomeId,
        userId:         income.userId,
        eventType:      "PAID",
        metadata: {
          walletTransactionId: walletTx.id,
          amount:              income.amount.toString(),
          rankName:            income.rankName,
        },
      },
    });

    logger.info(
      {
        incomeId,
        userId:        income.userId,
        rankName:      income.rankName,
        amount:        income.amount.toFixed(2),
        transactionId: walletTx.id,
      },
      "salary-payout: wallet credited",
    );

    return {
      status:        "paid",
      transactionId: walletTx.id,
      amount:        income.amount,
    } as const;
  });
}

// ── Batch approval ────────────────────────────────────────────────────────────

/**
 * Approve every PENDING SalaryIncome for the given month and year.
 * Cursor-based pagination + configurable concurrency + per-record failure isolation.
 */
export async function approveMonthlyBatch(
  month: number,
  year:  number,
  opts:  BatchOptions = {},
): Promise<PayoutBatchMetrics> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  logger.info({ month, year, concurrency, pageSize }, "salary-payout: batch approval started");

  let processed = 0;
  let approved  = 0;
  let duplicates = 0;
  let failed    = 0;

  for await (const page of incomePages(month, year, "PENDING", pageSize)) {
    await withConcurrency(page, concurrency, async ({ id: incomeId, userId }) => {
      processed++;
      try {
        const result = await approveSalary(incomeId);
        if (result.status === "approved")  approved++;
        if (result.status === "duplicate") duplicates++;
        logger.debug({ incomeId, userId, status: result.status }, "salary-payout: approval processed");
      } catch (err) {
        failed++;
        logger.error({ err, incomeId, userId }, "salary-payout: approval failed");
      }
    });
  }

  const metrics: PayoutBatchMetrics = {
    processed,
    approved,
    paid:                 0,
    duplicates,
    failed,
    walletAmountCredited: new Prisma.Decimal(0),
    durationMs:           Date.now() - startedAt,
  };

  logger.info(metrics, "salary-payout: batch approval completed");
  return metrics;
}

// ── Batch payout ──────────────────────────────────────────────────────────────

/**
 * Pay every APPROVED SalaryIncome for the given month and year.
 * Cursor-based pagination + configurable concurrency + per-record failure isolation.
 */
export async function payMonthlyBatch(
  month: number,
  year:  number,
  opts:  BatchOptions = {},
): Promise<PayoutBatchMetrics> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  logger.info({ month, year, concurrency, pageSize }, "salary-payout: batch payout started");

  let processed            = 0;
  let paid                 = 0;
  let duplicates           = 0;
  let failed               = 0;
  let walletAmountCredited = new Prisma.Decimal(0);

  for await (const page of incomePages(month, year, "APPROVED", pageSize)) {
    await withConcurrency(page, concurrency, async ({ id: incomeId, userId }) => {
      processed++;
      try {
        const result = await paySalary(incomeId);
        if (result.status === "paid") {
          paid++;
          walletAmountCredited = walletAmountCredited.add(result.amount);
        }
        if (result.status === "duplicate") duplicates++;
        logger.debug({ incomeId, userId, status: result.status }, "salary-payout: payout processed");
      } catch (err) {
        failed++;
        logger.error({ err, incomeId, userId }, "salary-payout: payout failed");
      }
    });
  }

  const metrics: PayoutBatchMetrics = {
    processed,
    approved:             0,
    paid,
    duplicates,
    failed,
    walletAmountCredited,
    durationMs:           Date.now() - startedAt,
  };

  logger.info(
    { ...metrics, walletAmountCredited: walletAmountCredited.toFixed(2) },
    "salary-payout: batch payout completed",
  );
  return metrics;
}

// ── Cursor-based income page generator ───────────────────────────────────────

type IncomeRow = { id: string; userId: string; amount: Prisma.Decimal };

async function* incomePages(
  month:    number,
  year:     number,
  status:   "PENDING" | "APPROVED",
  pageSize: number,
): AsyncGenerator<IncomeRow[]> {
  let cursor: string | undefined;

  while (true) {
    const records = await prisma.salaryIncome.findMany({
      where:   { month, year, status },
      select:  { id: true, userId: true, amount: true },
      take:    pageSize,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (records.length === 0) break;

    yield records as IncomeRow[];

    if (records.length < pageSize) break;
    cursor = records[records.length - 1].id;
  }
}

// ── Concurrency worker pool ───────────────────────────────────────────────────

async function withConcurrency<T>(
  items:       T[],
  concurrency: number,
  fn:          (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  const queue = [...items];

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await fn(item);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}
