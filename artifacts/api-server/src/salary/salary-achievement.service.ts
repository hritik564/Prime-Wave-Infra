import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { checkUserQualifications } from "./salary-qualification.engine";
import { notificationService } from "../notifications/notifications.service";

// ── Process achievements for a single user ────────────────────────────────────

/**
 * Evaluates ALL salary ranks a user currently qualifies for and handles each via
 * the three-case Reactivation Safety model (Sprint 23G):
 *
 *   Case 1 — No record exists:
 *     → Create a new SalaryAchievement. (Original behaviour.)
 *
 *   Case 2 — Record exists, isActive = true:
 *     → Do nothing. The user already owns this active achievement.
 *
 *   Case 3 — Record exists, isActive = false, user now qualifies:
 *     → Reactivate the existing record in-place:
 *          isActive      = true
 *          achievedAt    = now (fresh qualification timestamp)
 *          expiresAt     = achievedAt + configured duration
 *          monthlyAmount = current rank salary (reflects any config changes)
 *          paymentsMade  = 0  (fresh payment cycle)
 *          lastPaidAt    = null
 *        The same DB row is reused — the unique constraint stays intact.
 *        Historical paymentsMade from the prior cycle is logged but reset.
 *
 * Returns { created, reactivated } counts.
 */
export async function processUserAchievements(
  userId: string,
): Promise<{ created: number; reactivated: number }> {
  const qualifications = await checkUserQualifications(userId);
  const qualifying     = qualifications.filter((q) => q.qualifies);

  if (qualifying.length === 0) return { created: 0, reactivated: 0 };

  let created     = 0;
  let reactivated = 0;

  for (const q of qualifying) {
    const achievedAt = new Date();
    const expiresAt  = addMonths(achievedAt, q.durationMonths);

    // Look up any existing record for this (userId, rankName)
    const existing = await prisma.salaryAchievement.findUnique({
      where: { userId_rankName: { userId, rankName: q.rankName } },
    });

    // ── Case 2: Already active — skip (never duplicate) ───────────────────────
    if (existing?.isActive) {
      logger.debug(
        { userId, rankName: q.rankName },
        "Salary: achievement already active, skipping",
      );
      continue;
    }

    if (existing && !existing.isActive) {
      // ── Case 3: Inactive record — reactivate with a fresh cycle ─────────────
      await prisma.salaryAchievement.update({
        where: { id: existing.id },
        data: {
          isActive:      true,
          achievedAt,
          expiresAt,
          monthlyAmount: q.monthlySalary,
          paymentsMade:  0,
          lastPaidAt:    null,
        },
      });

      void notificationService.create({
        userId,
        type:    "RANK_ACHIEVED",
        title:   "Leadership Salary Rank Reactivated",
        message: `Congratulations! Your ${q.rankName} leadership salary rank has been reactivated. You will receive $${q.monthlySalary.toFixed(2)}/month for ${q.durationMonths} months.`,
        metadata: {
          rankName:              q.rankName,
          monthlySalary:         q.monthlySalary.toString(),
          totalBusinessUSD:      q.totalBusinessUSD?.toString() ?? "0",
          leftBusinessUSD:       q.leftBusinessUSD?.toString()  ?? "0",
          rightBusinessUSD:      q.rightBusinessUSD?.toString() ?? "0",
          expiresAt:             expiresAt.toISOString(),
          reactivated:           true,
          priorPaymentsMade:     existing.paymentsMade,
        },
      });

      reactivated++;
      logger.info(
        {
          userId,
          rankName:          q.rankName,
          expiresAt,
          priorPaymentsMade: existing.paymentsMade,
        },
        "Salary: achievement reactivated",
      );
    } else {
      // ── Case 1: No record — create fresh ─────────────────────────────────────
      await prisma.salaryAchievement.create({
        data: {
          userId,
          rankName:      q.rankName,
          achievedAt,
          expiresAt,
          monthlyAmount: q.monthlySalary,
          isActive:      true,
          paymentsMade:  0,
        },
      });

      void notificationService.create({
        userId,
        type:    "RANK_ACHIEVED",
        title:   "Leadership Salary Rank Achieved",
        message: `Congratulations! You have qualified for the ${q.rankName} leadership salary rank and will receive $${q.monthlySalary.toFixed(2)}/month for ${q.durationMonths} months.`,
        metadata: {
          rankName:         q.rankName,
          monthlySalary:    q.monthlySalary.toString(),
          totalBusinessUSD: q.totalBusinessUSD?.toString() ?? "0",
          leftBusinessUSD:  q.leftBusinessUSD?.toString()  ?? "0",
          rightBusinessUSD: q.rightBusinessUSD?.toString() ?? "0",
          expiresAt:        expiresAt.toISOString(),
          reactivated:      false,
        },
      });

      created++;
      logger.info(
        { userId, rankName: q.rankName, expiresAt },
        "Salary: achievement granted",
      );
    }
  }

  return { created, reactivated };
}

// ── Bulk scan all ACTIVE users ────────────────────────────────────────────────

/**
 * Runs processUserAchievements for every ACTIVE user.
 * Returns separate counts for newly created and reactivated achievements.
 * Called by admin trigger or scheduled rank-evaluation cron.
 */
export async function processAllAchievements(): Promise<{
  scanned:     number;
  granted:     number;
  created:     number;
  reactivated: number;
  skipped:     number;
  errors:      number;
}> {
  const users = await prisma.user.findMany({
    where:  { status: "ACTIVE" },
    select: { id: true },
  });

  logger.info({ count: users.length }, "Salary: scanning achievements for all active users");

  let created     = 0;
  let reactivated = 0;
  let skipped     = 0;
  let errors      = 0;

  for (const user of users) {
    try {
      const result = await processUserAchievements(user.id);
      created     += result.created;
      reactivated += result.reactivated;
      if (result.created === 0 && result.reactivated === 0) skipped++;
    } catch (err) {
      errors++;
      logger.error({ err, userId: user.id }, "Salary: error processing achievements");
    }
  }

  const granted = created + reactivated;

  logger.info(
    { scanned: users.length, granted, created, reactivated, skipped, errors },
    "Salary: bulk scan complete",
  );

  return { scanned: users.length, granted, created, reactivated, skipped, errors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
