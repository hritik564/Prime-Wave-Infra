/**
 * Sprint 33H — Monthly Salary Generation Engine
 *
 * Implements the Monthly Snapshot Model:
 *   • One SalaryIncome record per ACTIVE member per calendar month.
 *   • Salary amount = monthlySalary of the highest-ranked SalaryAchievement
 *     at the moment the job runs.  Future promotions do NOT alter historical months.
 *   • Completely idempotent — running twice produces zero duplicate records.
 *   • Fully transactional — either a record is created or nothing is committed.
 *
 * ── Two entry points ─────────────────────────────────────────────────────────
 *
 *   generateMonthlySalary(userId, month, year)
 *     Single-user generation.  Used by admin tools and batch internals.
 *
 *   generateMonthlyBatch(month, year, opts?)
 *     Batch all ACTIVE users.  Cursor pagination + configurable concurrency
 *     + per-user failure isolation — same architecture as the scheduler (33G).
 *
 * ── Salary generation algorithm ──────────────────────────────────────────────
 *
 *   1.  Pre-transaction: verify user is ACTIVE (early bail-out, no tx overhead).
 *   2.  Open Prisma transaction:
 *       a.  Idempotency guard: if (userId, month, year) row already exists → skip.
 *       b.  Load active SalaryAchievements joined with SalaryRankConfig.
 *       c.  If none → skip.
 *       d.  Sort by requiredBusiness DESC → pick highest.
 *       e.  If monthlySalary ≤ 0 → skip.
 *       f.  INSERT SalaryIncome with status=PENDING.
 *
 * ── Immutability guarantee ────────────────────────────────────────────────────
 *
 *   The idempotency guard in step 2a uses the DB-level @@unique([userId, month, year])
 *   constraint.  Even concurrent duplicate runs will hit a P2002 rather than insert
 *   a second record.  Historical SalaryIncome rows are NEVER modified by this service.
 *
 * ── What this sprint does NOT do ─────────────────────────────────────────────
 *
 *   Wallet credits, payout logic, APPROVED/PAID transitions, salary reversals —
 *   these are Sprint 33I.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GenerateResult =
  | { status: "generated"; rankName: string; amount: Prisma.Decimal }
  | { status: "duplicate" }
  | { status: "skipped"; reason: "inactive" | "no-achievement" | "zero-salary" };

export interface SalaryBatchMetrics {
  usersProcessed:    number;
  salaryGenerated:   number;
  duplicatesSkipped: number;
  usersSkipped:      number;
  usersFailed:       number;
  durationMs:        number;
}

export interface BatchOptions {
  /** Simultaneous workers.  Default: 10. */
  concurrency?: number;
  /** Users per DB page.  Default: 500. */
  pageSize?: number;
}

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_PAGE_SIZE   = 500;

// ── Single-user generation ────────────────────────────────────────────────────

/**
 * Generate one SalaryIncome record for userId in (month, year).
 *
 * Idempotent: a second call for the same (userId, month, year) returns
 * `{ status: "duplicate" }` without modifying the existing record.
 */
export async function generateMonthlySalary(
  userId: string,
  month:  number,
  year:   number,
): Promise<GenerateResult> {
  logger.info({ userId, month, year }, "salary-income: monthly generation started");

  // ── Pre-transaction eligibility check ───────────────────────────────────────
  // Avoids opening an unnecessary transaction for inactive or missing users.
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, status: true },
  });

  if (!user || user.status !== "ACTIVE") {
    logger.info({ userId, month, year }, "salary-income: user inactive or not found — skipped");
    return { status: "skipped", reason: "inactive" };
  }

  // ── Transactional generation ─────────────────────────────────────────────────
  return prisma.$transaction(async (tx) => {
    // 2a. Idempotency guard
    const existing = await tx.salaryIncome.findUnique({
      where:  { userId_month_year: { userId, month, year } },
      select: { id: true, rankName: true },
    });

    if (existing) {
      logger.info(
        { userId, month, year, existingId: existing.id },
        "salary-income: record already exists — duplicate skipped",
      );
      return { status: "duplicate" } as const;
    }

    // 2b. Load active achievements with rank configuration
    const achievements = await tx.salaryAchievement.findMany({
      where:   { userId, isActive: true },
      include: {
        config: {
          select: { monthlySalary: true, requiredBusiness: true },
        },
      },
    });

    // 2c. No achievements → not eligible
    if (achievements.length === 0) {
      logger.info({ userId, month, year }, "salary-income: no active achievements — skipped");
      return { status: "skipped", reason: "no-achievement" } as const;
    }

    // 2d. Pick the highest rank (sort by requiredBusiness DESC in application layer
    //     to avoid Prisma relation-sort edge cases across DB engines).
    const sorted = [...achievements].sort((a, b) =>
      b.config.requiredBusiness.comparedTo(a.config.requiredBusiness),
    );
    const highest = sorted[0];

    // 2e. Zero-salary guard
    if (highest.config.monthlySalary.lte(0)) {
      logger.info(
        { userId, month, year, rankName: highest.rankName },
        "salary-income: configured salary is zero — skipped",
      );
      return { status: "skipped", reason: "zero-salary" } as const;
    }

    // 2f. Create SalaryIncome — status begins as PENDING
    const income = await tx.salaryIncome.create({
      data: {
        userId,
        rankName:  highest.rankName,
        month,
        year,
        amount:    highest.config.monthlySalary,
        status:    "PENDING",
        reference: `salary-${userId}-${year}-${String(month).padStart(2, "0")}`,
      },
    });

    logger.info(
      {
        userId,
        month,
        year,
        rankName: highest.rankName,
        amount:   highest.config.monthlySalary.toFixed(2),
        incomeId: income.id,
      },
      "salary-income: salary generated",
    );

    return {
      status:   "generated",
      rankName: highest.rankName,
      amount:   highest.config.monthlySalary,
    } as const;
  });
}

// ── Batch generation ──────────────────────────────────────────────────────────

/**
 * Generate monthly salary for every ACTIVE user.
 *
 * Uses cursor-based pagination (O(pageSize) memory) and a fixed-size worker
 * pool (configurable concurrency).  Per-user failure isolation: one user
 * throwing never aborts the batch.
 */
export async function generateMonthlyBatch(
  month: number,
  year:  number,
  opts:  BatchOptions = {},
): Promise<SalaryBatchMetrics> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  logger.info({ month, year, concurrency, pageSize }, "salary-income: batch generation started");

  let usersProcessed    = 0;
  let salaryGenerated   = 0;
  let duplicatesSkipped = 0;
  let usersSkipped      = 0;
  let usersFailed       = 0;

  for await (const page of userPages(pageSize)) {
    await withConcurrency(page, concurrency, async ({ id: userId }) => {
      usersProcessed++;
      try {
        const result = await generateMonthlySalary(userId, month, year);

        switch (result.status) {
          case "generated":  salaryGenerated++;   break;
          case "duplicate":  duplicatesSkipped++; break;
          case "skipped":    usersSkipped++;      break;
        }

        logger.debug(
          { userId, month, year, status: result.status },
          "salary-income: user processed",
        );
      } catch (err) {
        usersFailed++;
        logger.error({ err, userId, month, year }, "salary-income: user failed");
        // Intentional: failure isolation — never abort the batch
      }
    });
  }

  const metrics: SalaryBatchMetrics = {
    usersProcessed,
    salaryGenerated,
    duplicatesSkipped,
    usersSkipped,
    usersFailed,
    durationMs: Date.now() - startedAt,
  };

  logger.info(metrics, "salary-income: batch generation completed");
  return metrics;
}

// ── Cursor-based user page generator ─────────────────────────────────────────

async function* userPages(
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
