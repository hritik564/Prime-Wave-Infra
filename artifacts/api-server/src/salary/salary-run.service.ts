/**
 * Sprint 33J — Salary Run Management
 *
 * Orchestrates the full monthly payroll lifecycle via SalaryRun state machine.
 *
 * ── Lifecycle ─────────────────────────────────────────────────────────────────
 *
 *   GENERATING → GENERATED → APPROVING → APPROVED → PAYING → COMPLETED
 *   Any stage → FAILED (via markRunFailed)
 *
 * ── Functions ─────────────────────────────────────────────────────────────────
 *
 *   createSalaryRun(month, year, opts)   Create and initialise a run (idempotent).
 *   executeGeneration(runId, opts)       Generate SalaryIncome for every ACTIVE user.
 *   executeApproval(runId, opts)         Approve all PENDING incomes in the run.
 *   executePayout(runId, opts)           Pay all APPROVED incomes in the run.
 *   markRunFailed(runId, reason)         Force-transition any run to FAILED.
 *
 * ── Orchestration contract ────────────────────────────────────────────────────
 *
 *   - Does NOT re-implement generation/approval/payout business rules.
 *   - Calls salary-income.service for generation.
 *   - Calls salary-payout.service for approval and payout.
 *   - Every SalaryRun status transition is atomic: status + counters + audit
 *     commit together in one Prisma transaction or nothing commits.
 *
 * ── DO NOT TOUCH ──────────────────────────────────────────────────────────────
 *
 *   Qualification, SalaryBusinessSummary, SalaryBusinessEvent,
 *   SalaryAchievement, Salary Scheduler, Monthly Snapshot rules,
 *   Salary payout rules, Wallet logic.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { generateMonthlySalary } from "./salary-income.service";
import { approveSalary, paySalary } from "./salary-payout.service";

// ── Result and metrics types ──────────────────────────────────────────────────

export type SalaryRunRow = {
  id:             string;
  month:          number;
  year:           number;
  status:         string;
  generatedCount: number;
  approvedCount:  number;
  paidCount:      number;
  failedCount:    number;
  totalAmount:    Prisma.Decimal;
  createdBy:      string | null;
  notes:          string | null;
  startedAt:      Date;
  completedAt:    Date | null;
  createdAt:      Date;
  updatedAt:      Date;
};

export type CreateRunResult =
  | { status: "created";   run: SalaryRunRow }
  | { status: "duplicate"; run: SalaryRunRow };

export interface RunGenerationResult {
  generatedCount: number;
  totalAmount:    Prisma.Decimal;
  failedCount:    number;
  durationMs:     number;
}

export interface RunApprovalResult {
  approvedCount: number;
  failedCount:   number;
  durationMs:    number;
}

export interface RunPayoutResult {
  paidCount:            number;
  failedCount:          number;
  walletAmountCredited: Prisma.Decimal;
  finalStatus:          "COMPLETED" | "FAILED";
  durationMs:           number;
}

export interface RunBatchOptions {
  concurrency?: number;
  pageSize?:    number;
  createdBy?:   string;
  notes?:       string;
}

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_PAGE_SIZE   = 500;

// ── Create run ────────────────────────────────────────────────────────────────

/**
 * Create a SalaryRun for (month, year).
 *
 * Idempotent: if a run already exists for the same (month, year), returns
 * { status: "duplicate", run: <existing> } without creating a second run.
 *
 * The run starts in GENERATING status and an immutable RUN_CREATED audit
 * entry is written in the same transaction.
 */
export async function createSalaryRun(
  month: number,
  year:  number,
  opts:  RunBatchOptions = {},
): Promise<CreateRunResult> {
  logger.info({ month, year }, "salary-run: creating salary run");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.salaryRun.findUnique({
      where: { month_year: { month, year } },
    });

    if (existing) {
      logger.info(
        { month, year, runId: existing.id, status: existing.status },
        "salary-run: run already exists — duplicate",
      );
      return { status: "duplicate", run: existing as SalaryRunRow };
    }

    const run = await tx.salaryRun.create({
      data: {
        month,
        year,
        status:    "GENERATING",
        createdBy: opts.createdBy ?? null,
        notes:     opts.notes    ?? null,
      },
    });

    await tx.salaryRunAudit.create({
      data: {
        salaryRunId: run.id,
        action:      "RUN_CREATED",
        performedBy: opts.createdBy ?? null,
        metadata:    { month, year },
      },
    });

    logger.info({ runId: run.id, month, year }, "salary-run: run created");
    return { status: "created", run: run as SalaryRunRow };
  });
}

// ── Execute generation ────────────────────────────────────────────────────────

/**
 * Generate SalaryIncome for every ACTIVE user, attaching each record to runId.
 * Run must be in GENERATING status.
 * On success, atomically transitions run → GENERATED + updates counters + audit.
 */
export async function executeGeneration(
  runId: string,
  opts:  RunBatchOptions = {},
): Promise<RunGenerationResult> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  const run = await prisma.salaryRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`SalaryRun not found: ${runId}`);

  if (run.status !== "GENERATING") {
    logger.warn({ runId, status: run.status }, "salary-run: executeGeneration skipped — wrong status");
    return {
      generatedCount: run.generatedCount,
      totalAmount:    run.totalAmount,
      failedCount:    run.failedCount,
      durationMs:     Date.now() - startedAt,
    };
  }

  logger.info({ runId, month: run.month, year: run.year }, "salary-run: generation started");

  let generatedCount = 0;
  let totalAmount    = new Prisma.Decimal(0);
  let failedCount    = 0;

  for await (const page of activeUserPages(pageSize)) {
    await withConcurrency(page, concurrency, async ({ id: userId }) => {
      try {
        const result = await generateMonthlySalary(userId, run.month, run.year, runId);
        if (result.status === "generated") {
          generatedCount++;
          totalAmount = totalAmount.add(result.amount);
        }
      } catch (err) {
        failedCount++;
        logger.error({ err, userId, runId }, "salary-run: generation failed for user");
      }
    });
  }

  // Atomic: status + counters + audit
  await prisma.$transaction(async (tx) => {
    await tx.salaryRun.update({
      where: { id: runId },
      data:  { status: "GENERATED", generatedCount, totalAmount, failedCount },
    });
    await tx.salaryRunAudit.create({
      data: {
        salaryRunId: runId,
        action:      "GENERATION_COMPLETED",
        metadata:    {
          generatedCount,
          failedCount,
          totalAmount: totalAmount.toFixed(2),
        },
      },
    });
  });

  const durationMs = Date.now() - startedAt;
  logger.info({ runId, generatedCount, failedCount, durationMs }, "salary-run: generation completed");
  return { generatedCount, totalAmount, failedCount, durationMs };
}

// ── Execute approval ──────────────────────────────────────────────────────────

/**
 * Approve every PENDING SalaryIncome that belongs to this run.
 * Run must be in GENERATED status.
 * Atomically transitions GENERATED → APPROVING (start), then APPROVING → APPROVED (end).
 */
export async function executeApproval(
  runId: string,
  opts:  RunBatchOptions = {},
): Promise<RunApprovalResult> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  const run = await prisma.salaryRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`SalaryRun not found: ${runId}`);

  if (run.status !== "GENERATED") {
    logger.warn({ runId, status: run.status }, "salary-run: executeApproval skipped — wrong status");
    return { approvedCount: run.approvedCount, failedCount: 0, durationMs: Date.now() - startedAt };
  }

  // Atomic: GENERATED → APPROVING + audit
  await prisma.$transaction(async (tx) => {
    await tx.salaryRun.update({ where: { id: runId }, data: { status: "APPROVING" } });
    await tx.salaryRunAudit.create({
      data: { salaryRunId: runId, action: "APPROVAL_STARTED", performedBy: opts.createdBy ?? null },
    });
  });

  logger.info({ runId }, "salary-run: approval started");

  let approvedCount = 0;
  let failedCount   = 0;

  for await (const page of runIncomePages(runId, "PENDING", pageSize)) {
    await withConcurrency(page, concurrency, async ({ id: incomeId }) => {
      try {
        const result = await approveSalary(incomeId);
        if (result.status === "approved") approvedCount++;
      } catch (err) {
        failedCount++;
        logger.error({ err, incomeId, runId }, "salary-run: approval failed for income");
      }
    });
  }

  // Atomic: APPROVING → APPROVED + counters + audit
  await prisma.$transaction(async (tx) => {
    await tx.salaryRun.update({
      where: { id: runId },
      data:  { status: "APPROVED", approvedCount },
    });
    await tx.salaryRunAudit.create({
      data: {
        salaryRunId: runId,
        action:      "APPROVAL_COMPLETED",
        metadata:    { approvedCount, failedCount },
      },
    });
  });

  const durationMs = Date.now() - startedAt;
  logger.info({ runId, approvedCount, failedCount, durationMs }, "salary-run: approval completed");
  return { approvedCount, failedCount, durationMs };
}

// ── Execute payout ────────────────────────────────────────────────────────────

/**
 * Pay every APPROVED SalaryIncome that belongs to this run.
 * Run must be in APPROVED status.
 * Atomically transitions APPROVED → PAYING (start), then PAYING → COMPLETED|FAILED (end).
 */
export async function executePayout(
  runId: string,
  opts:  RunBatchOptions = {},
): Promise<RunPayoutResult> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  const run = await prisma.salaryRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`SalaryRun not found: ${runId}`);

  if (run.status !== "APPROVED") {
    logger.warn({ runId, status: run.status }, "salary-run: executePayout skipped — wrong status");
    return {
      paidCount:            run.paidCount,
      failedCount:          0,
      walletAmountCredited: new Prisma.Decimal(0),
      finalStatus:          run.status === "COMPLETED" ? "COMPLETED" : "FAILED",
      durationMs:           Date.now() - startedAt,
    };
  }

  // Atomic: APPROVED → PAYING + audit
  await prisma.$transaction(async (tx) => {
    await tx.salaryRun.update({ where: { id: runId }, data: { status: "PAYING" } });
    await tx.salaryRunAudit.create({
      data: { salaryRunId: runId, action: "PAYOUT_STARTED", performedBy: opts.createdBy ?? null },
    });
  });

  logger.info({ runId }, "salary-run: payout started");

  let paidCount            = 0;
  let failedCount          = 0;
  let walletAmountCredited = new Prisma.Decimal(0);

  for await (const page of runIncomePages(runId, "APPROVED", pageSize)) {
    await withConcurrency(page, concurrency, async ({ id: incomeId }) => {
      try {
        const result = await paySalary(incomeId);
        if (result.status === "paid") {
          paidCount++;
          walletAmountCredited = walletAmountCredited.add(result.amount);
        }
      } catch (err) {
        failedCount++;
        logger.error({ err, incomeId, runId }, "salary-run: payout failed for income");
      }
    });
  }

  // Determine final status: FAILED only if every single record failed
  const finalStatus: "COMPLETED" | "FAILED" =
    paidCount === 0 && failedCount > 0 ? "FAILED" : "COMPLETED";

  // Atomic: PAYING → COMPLETED|FAILED + counters + audit
  await prisma.$transaction(async (tx) => {
    await tx.salaryRun.update({
      where: { id: runId },
      data:  {
        status:      finalStatus,
        paidCount,
        failedCount,
        completedAt: new Date(),
      },
    });
    await tx.salaryRunAudit.create({
      data: {
        salaryRunId: runId,
        action:      finalStatus === "COMPLETED" ? "PAYOUT_COMPLETED" : "RUN_FAILED",
        metadata:    {
          paidCount,
          failedCount,
          walletAmountCredited: walletAmountCredited.toFixed(2),
        },
      },
    });
  });

  const durationMs = Date.now() - startedAt;
  logger.info(
    { runId, paidCount, failedCount, walletAmountCredited: walletAmountCredited.toFixed(2), finalStatus, durationMs },
    "salary-run: payout completed",
  );
  return { paidCount, failedCount, walletAmountCredited, finalStatus, durationMs };
}

// ── Mark run failed ───────────────────────────────────────────────────────────

/**
 * Force-transition any run to FAILED status.
 * Writes an immutable RUN_FAILED audit entry.
 */
export async function markRunFailed(
  runId:       string,
  reason?:     string,
  performedBy?: string,
): Promise<void> {
  logger.warn({ runId, reason }, "salary-run: marking run as failed");

  await prisma.$transaction(async (tx) => {
    await tx.salaryRun.update({
      where: { id: runId },
      data:  { status: "FAILED" },
    });
    await tx.salaryRunAudit.create({
      data: {
        salaryRunId: runId,
        action:      "RUN_FAILED",
        performedBy: performedBy ?? null,
        metadata:    reason ? { reason } : undefined,
      },
    });
  });
}

// ── Cursor-based page generators ──────────────────────────────────────────────

async function* activeUserPages(
  pageSize: number,
): AsyncGenerator<Array<{ id: string }>> {
  let cursor: string | undefined;
  while (true) {
    const users = await prisma.user.findMany({
      where:   { status: "ACTIVE" },
      select:  { id: true },
      take:    pageSize,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;
    yield users;
    if (users.length < pageSize) break;
    cursor = users[users.length - 1].id;
  }
}

async function* runIncomePages(
  runId:    string,
  status:   "PENDING" | "APPROVED",
  pageSize: number,
): AsyncGenerator<Array<{ id: string; userId: string }>> {
  let cursor: string | undefined;
  while (true) {
    const records = await prisma.salaryIncome.findMany({
      where:   { salaryRunId: runId, status },
      select:  { id: true, userId: true },
      take:    pageSize,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (records.length === 0) break;
    yield records;
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
