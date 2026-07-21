/**
 * Sprint 33F — Salary Qualification Engine
 *
 * Reads SalaryBusinessSummary counters, evaluates every active SalaryRankConfig,
 * and creates SalaryAchievement records.  No payout, no scheduler, no revocation.
 *
 * ── Algorithm ────────────────────────────────────────────────────────────────
 *
 *  1. Guard: skip if user is not ACTIVE.
 *  2. Open a single Prisma transaction.
 *  3. Load SalaryBusinessSummary, active SalaryRankConfigs (ASC requiredBusiness),
 *     and existing SalaryAchievements for the user.
 *  4. Determine Gold-unlock state:
 *       unlocked = any SalaryAchievement with rankName = "Gold" exists.
 *     (Stored nowhere — computed from the achievement table on every run.)
 *  5. Iterate ranks lowest → highest:
 *       a. Compute effectiveBusiness via computeEffectiveBusiness().
 *       b. If effectiveBusiness < requiredBusiness → insufficient, continue.
 *       c. If achievement already exists → duplicate, continue.
 *       d. Otherwise upsert achievement (empty update path → permanent, never overwritten).
 *       e. If this rank is Gold AND user was not previously unlocked →
 *            set unlocked = true  (immediate same-pass effect on remaining ranks).
 *  6. Commit. Either all new achievements are written, or none.
 *
 * ── Effective Business ───────────────────────────────────────────────────────
 *
 *  DIRECT_ONLY → directBusiness only (regardless of unlock state).
 *  ALL_BUSINESS:
 *    unlocked = false → directBusiness only.
 *    unlocked = true  → directBusiness + downlineBusiness + powerBusiness.
 *
 * ── Idempotency ──────────────────────────────────────────────────────────────
 *
 *  @@unique(userId, rankName) on SalaryAchievement.
 *  upsert with empty update path: replaying the same qualification run is safe.
 *
 * ── Never revoke ─────────────────────────────────────────────────────────────
 *
 *  Achievements are cumulative milestones.  This service NEVER deletes, deactivates,
 *  downgrades, or overrides any existing SalaryAchievement row.
 */

import { Prisma } from "@prisma/client";
import type { SalaryQualificationPool, SalaryBusinessSummary } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The rank whose achievement triggers the Gold-unlock.
 * When a Gold achievement exists, ALL_BUSINESS pools become available.
 */
const GOLD_RANK_NAME = "Gold";

// ── Pure helper ───────────────────────────────────────────────────────────────

/**
 * Compute the effective qualifying business for a single rank evaluation.
 *
 * @param summary          The user's SalaryBusinessSummary counters.
 * @param qualificationPool The pool rule from SalaryRankConfig.
 * @param unlocked          Whether the user has achieved Gold (or better).
 * @returns                 The Decimal amount that counts toward this rank.
 */
export function computeEffectiveBusiness(
  summary: Pick<SalaryBusinessSummary, "directBusiness" | "downlineBusiness" | "powerBusiness">,
  qualificationPool: SalaryQualificationPool,
  unlocked: boolean,
): Prisma.Decimal {
  if (qualificationPool === "DIRECT_ONLY") {
    // Downline + power never count for DIRECT_ONLY ranks
    return summary.directBusiness;
  }

  // ALL_BUSINESS — downline and power only unlock after Gold is achieved
  if (unlocked) {
    return summary.directBusiness
      .plus(summary.downlineBusiness)
      .plus(summary.powerBusiness);
  }

  // Locked: treat as direct-only until Gold is earned
  return summary.directBusiness;
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface QualificationResult {
  userId:       string;
  /** Achievements created in this run. */
  created:      number;
  /** Ranks already held — skipped (never re-created). */
  duplicate:    number;
  /** Ranks where effectiveBusiness < requiredBusiness — not awarded. */
  insufficient: number;
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Run the full qualification pass for one user.
 *
 * All new achievements are written inside a single transaction.
 * Failures propagate to the caller — the scheduler wraps each user in
 * its own try/catch so one user's failure does not abort the full scan.
 */
export async function runQualificationForUser(
  userId: string,
): Promise<QualificationResult> {
  // ── Guard: skip inactive users before opening any transaction ────────────
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, status: true },
  });

  if (!user || user.status !== "ACTIVE") {
    logger.info(
      { userId, status: user?.status ?? "not_found" },
      "salary-qualification: user inactive or not found — skipped",
    );
    return { userId, created: 0, duplicate: 0, insufficient: 0 };
  }

  logger.info({ userId }, "salary-qualification: qualification started");

  try {
    const counts = await prisma.$transaction(async (tx) => {
      // ── Load data in parallel ───────────────────────────────────────────
      const [summary, ranks, existingAchievements] = await Promise.all([
        tx.salaryBusinessSummary.findUnique({
          where:  { userId },
          select: { directBusiness: true, downlineBusiness: true, powerBusiness: true },
        }),
        tx.salaryRankConfig.findMany({
          where:   { isActive: true },
          orderBy: { requiredBusiness: "asc" },
          select: {
            rankName:         true,
            requiredBusiness: true,
            monthlySalary:    true,
            durationMonths:   true,
            qualificationPool: true,
          },
        }),
        tx.salaryAchievement.findMany({
          where:  { userId },
          select: { rankName: true },
        }),
      ]);

      // ── No business summary → nothing to evaluate ──────────────────────
      if (!summary) {
        logger.debug(
          { userId },
          "salary-qualification: no SalaryBusinessSummary found — skipped",
        );
        return { created: 0, duplicate: 0, insufficient: 0 };
      }

      // ── Determine initial Gold-unlock state ────────────────────────────
      const held = new Set(existingAchievements.map((a) => a.rankName));
      let unlocked = held.has(GOLD_RANK_NAME);

      if (unlocked) {
        logger.info(
          { userId },
          "salary-qualification: Gold unlock detected — ALL_BUSINESS active",
        );
      }

      let created     = 0;
      let duplicate   = 0;
      let insufficient = 0;

      // ── Evaluate every active rank lowest → highest ────────────────────
      for (const rank of ranks) {
        const effective = computeEffectiveBusiness(summary, rank.qualificationPool, unlocked);

        if (effective.lt(rank.requiredBusiness)) {
          insufficient++;
          continue;
        }

        if (held.has(rank.rankName)) {
          logger.debug(
            { userId, rankName: rank.rankName },
            "salary-qualification: duplicate skipped",
          );
          duplicate++;
          continue;
        }

        // ── Upsert the achievement (empty update = permanent) ──────────
        const achievedAt = new Date();
        const expiresAt  = addMonths(achievedAt, rank.durationMonths);

        await tx.salaryAchievement.upsert({
          where: {
            userId_rankName: { userId, rankName: rank.rankName },
          },
          create: {
            userId,
            rankName:      rank.rankName,
            achievedAt,
            expiresAt,
            monthlyAmount: rank.monthlySalary,
            isActive:      true,
            paymentsMade:  0,
          },
          update: {},   // achievements are permanent — update path is intentionally empty
        });

        held.add(rank.rankName);
        created++;

        logger.info(
          {
            userId,
            rankName:   rank.rankName,
            effective:  effective.toFixed(2),
            required:   rank.requiredBusiness.toFixed(2),
          },
          "salary-qualification: rank achieved",
        );

        // ── Gold unlock — takes effect immediately for remaining ranks ──
        if (rank.rankName === GOLD_RANK_NAME && !unlocked) {
          unlocked = true;
          logger.info(
            { userId },
            "salary-qualification: Gold unlock triggered — ALL_BUSINESS now active for remaining ranks",
          );
        }
      }

      return { created, duplicate, insufficient };
    });

    logger.info(
      { userId, ...counts },
      "salary-qualification: qualification completed",
    );

    return { userId, ...counts };
  } catch (err) {
    logger.error({ err, userId }, "salary-qualification: transaction failed");
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
