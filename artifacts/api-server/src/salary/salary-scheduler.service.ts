/**
 * Sprint 33G — Salary Qualification Scheduler
 *
 * Operational layer for the Salary Engine (Sprint 33F).
 * Executes runQualificationForUser safely, scalably, and fault-tolerantly.
 *
 * ── Four jobs ──────────────────────────────────────────────────────────────
 *
 *  evaluateUser()             Job 1 — incremental (triggered by business events)
 *  runNightlyQualification()  Job 2 — batch all ACTIVE users
 *  runReconciliation()        Job 3 — full rebuild + lastReconciledAt
 *  rebuildUser()              Job 4 — single-user debug / admin recovery
 *
 * ── Architecture ──────────────────────────────────────────────────────────
 *
 *  Cursor-based pagination   → memory stays O(pageSize) regardless of user count.
 *  Configurable worker pool  → prevents DB connection exhaustion at scale.
 *  Per-user failure isolation → one bad user never aborts the batch.
 *  Full idempotency          → running twice never creates duplicate achievements.
 *
 * ── Hooks ─────────────────────────────────────────────────────────────────
 *
 *  Jobs 2 and 3 are called by the nightly cron (Sprint 33H).
 *  Job 1 (evaluateUser) is called by SalaryBusinessService after every
 *  SalaryBusinessSummary update.
 *
 * ── lastReconciledAt ──────────────────────────────────────────────────────
 *
 *  ONLY the reconciliation job (Job 3) touches lastReconciledAt.
 *  Nightly qualification (Job 2) and incremental runs (Job 1) must NOT update it.
 */

import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import {
  runQualificationForUser,
  type QualificationResult,
} from "./salary-qualification.service";

export type { QualificationResult };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BatchMetrics {
  usersProcessed:         number;
  usersSucceeded:         number;
  usersFailed:            number;
  newAchievementsCreated: number;
  duplicatesSkipped:      number;
  durationMs:             number;
}

export interface BatchOptions {
  /** Number of users processed concurrently.  Default: 10. */
  concurrency?: number;
  /** Users fetched per database page.  Default: 500. */
  pageSize?: number;
}

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_PAGE_SIZE   = 500;

// ── Job 1 — Incremental qualification ────────────────────────────────────────

/**
 * Re-evaluate a single user's salary qualification.
 *
 * Called immediately after a SalaryBusinessSummary update so that only the
 * affected user (and their upline ancestors) are re-qualified — never the
 * entire network.
 */
export async function evaluateUser(userId: string): Promise<QualificationResult> {
  logger.info({ userId }, "salary-scheduler: incremental qualification started");
  const result = await runQualificationForUser(userId);
  logger.info(
    { userId, created: result.created, duplicate: result.duplicate },
    "salary-scheduler: incremental qualification completed",
  );
  return result;
}

// ── Job 4 — Single user rebuild ───────────────────────────────────────────────

/**
 * Rebuild qualification state for one user.
 * Useful for admin tooling, support debugging, and targeted recovery.
 */
export async function rebuildUser(userId: string): Promise<QualificationResult> {
  logger.info({ userId }, "salary-scheduler: single-user rebuild started");
  const result = await runQualificationForUser(userId);
  logger.info(
    { userId, created: result.created, duplicate: result.duplicate },
    "salary-scheduler: single-user rebuild completed",
  );
  return result;
}

// ── Job 2 — Nightly qualification ─────────────────────────────────────────────

/**
 * Process every ACTIVE user through the qualification engine once per night.
 * Failures are isolated per user — one failure never aborts the batch.
 *
 * Does NOT update lastReconciledAt — use runReconciliation() for that.
 */
export async function runNightlyQualification(
  opts: BatchOptions = {},
): Promise<BatchMetrics> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  logger.info(
    { concurrency, pageSize },
    "salary-scheduler: nightly qualification started",
  );

  const counts = await processBatch({
    concurrency,
    pageSize,
    afterSuccess: null,   // nightly run does NOT touch lastReconciledAt
  });

  const result: BatchMetrics = { ...counts, durationMs: Date.now() - startedAt };
  logger.info(result, "salary-scheduler: nightly qualification completed");
  return result;
}

// ── Job 3 — Full reconciliation ───────────────────────────────────────────────

/**
 * Administrative full reconciliation.
 * Rebuilds qualification state from existing SalaryBusinessSummary.
 *
 * After each user's successful qualification, sets
 * SalaryBusinessSummary.lastReconciledAt so operators can audit coverage.
 *
 * Never modifies SalaryBusinessSummary counters or SalaryBusinessEvent records.
 * Only creates missing SalaryAchievement rows.
 */
export async function runReconciliation(
  opts: BatchOptions = {},
): Promise<BatchMetrics> {
  const startedAt   = Date.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const pageSize    = opts.pageSize    ?? DEFAULT_PAGE_SIZE;

  logger.info(
    { concurrency, pageSize },
    "salary-scheduler: reconciliation started",
  );

  const counts = await processBatch({
    concurrency,
    pageSize,
    afterSuccess: async (userId: string) => {
      await prisma.salaryBusinessSummary.update({
        where: { userId },
        data:  { lastReconciledAt: new Date() },
      });
    },
  });

  const result: BatchMetrics = { ...counts, durationMs: Date.now() - startedAt };
  logger.info(result, "salary-scheduler: reconciliation completed");
  return result;
}

// ── Shared batch processor ─────────────────────────────────────────────────────

interface ProcessBatchOpts {
  concurrency:  number;
  pageSize:     number;
  /** Called after a successful user qualification. null = no-op. */
  afterSuccess: ((userId: string) => Promise<void>) | null;
}

interface BatchCounts {
  usersProcessed:         number;
  usersSucceeded:         number;
  usersFailed:            number;
  newAchievementsCreated: number;
  duplicatesSkipped:      number;
}

async function processBatch(opts: ProcessBatchOpts): Promise<BatchCounts> {
  const { concurrency, pageSize, afterSuccess } = opts;

  let usersProcessed         = 0;
  let usersSucceeded         = 0;
  let usersFailed            = 0;
  let newAchievementsCreated = 0;
  let duplicatesSkipped      = 0;

  for await (const page of userPages(pageSize)) {
    await withConcurrency(page, concurrency, async ({ id: userId }) => {
      usersProcessed++;
      logger.debug({ userId }, "salary-scheduler: user started");

      try {
        const result = await runQualificationForUser(userId);

        newAchievementsCreated += result.created;
        duplicatesSkipped      += result.duplicate;

        if (afterSuccess) await afterSuccess(userId);

        usersSucceeded++;
        logger.debug(
          { userId, created: result.created, duplicate: result.duplicate },
          "salary-scheduler: user completed",
        );
      } catch (err) {
        usersFailed++;
        logger.error({ err, userId }, "salary-scheduler: user failed");
        // Intentional: failure isolation — continue to the next user
      }
    });
  }

  return {
    usersProcessed,
    usersSucceeded,
    usersFailed,
    newAchievementsCreated,
    duplicatesSkipped,
  };
}

// ── Cursor-based user page generator ──────────────────────────────────────────

/**
 * Yields pages of ACTIVE user IDs using cursor-based pagination.
 * Memory is bounded to O(pageSize) regardless of total user count.
 */
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

    if (users.length < pageSize) break;  // last page — no need for another query
    cursor = users[users.length - 1].id;
  }
}

// ── Concurrency worker pool ────────────────────────────────────────────────────

/**
 * Process items with a fixed-size worker pool.
 * Workers pull from a shared queue, naturally balancing uneven workloads.
 *
 * @param items       Items to process.
 * @param concurrency Maximum simultaneous workers.
 * @param fn          Async task for each item. Must not throw (caller handles).
 */
async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
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
