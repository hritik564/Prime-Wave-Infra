import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { checkUserQualifications } from "./salary-qualification.engine";
import { notificationService } from "../notifications/notifications.service";

// ── Process achievements for a single user ────────────────────────────────────

/**
 * Checks qualification for all active ranks and creates SalaryAchievement
 * records for newly qualified ranks.
 *
 * Idempotent — skips ranks where an achievement already exists (@@unique).
 * Achievements are never revoked; once earned, the record persists.
 *
 * Returns the count of new achievements granted.
 */
export async function processUserAchievements(userId: string): Promise<number> {
  const qualifications = await checkUserQualifications(userId);
  let granted = 0;

  for (const q of qualifications) {
    if (!q.qualifies) continue;

    // Look up full rank config for durationMonths
    const config = await prisma.salaryRankConfig.findUnique({
      where:  { rankName: q.rankName },
      select: { durationMonths: true, monthlySalary: true },
    });
    if (!config) continue;

    const achievedAt = new Date();
    const expiresAt  = addMonths(achievedAt, config.durationMonths);

    try {
      await prisma.salaryAchievement.create({
        data: {
          userId,
          rankName:      q.rankName,
          achievedAt,
          expiresAt,
          monthlyAmount: config.monthlySalary,
          isActive:      true,
        },
      });
      void notificationService.create({
        userId,
        type:    "RANK_ACHIEVED",
        title:   "New Rank Achieved",
        message: `Congratulations! You have achieved the ${q.rankName} rank and unlocked a monthly leadership salary.`,
        metadata: { rankName: q.rankName, monthlySalary: config.monthlySalary.toString(), expiresAt: expiresAt.toISOString() },
      });

      granted++;
      logger.info(
        { userId, rankName: q.rankName, expiresAt },
        "Salary: achievement granted",
      );
    } catch (err: unknown) {
      // Unique constraint violation = already achieved — safe to ignore.
      if (isUniqueConstraintError(err)) continue;
      throw err;
    }
  }

  return granted;
}

// ── Bulk check all active users ───────────────────────────────────────────────

/**
 * Runs processUserAchievements for every ACTIVE user.
 * Called externally (admin trigger or cron) to batch-update achievements.
 */
export async function processAllAchievements(): Promise<void> {
  const users = await prisma.user.findMany({
    where:  { status: "ACTIVE" },
    select: { id: true },
  });

  logger.info({ count: users.length }, "Salary: scanning achievements for all users");

  for (const user of users) {
    try {
      await processUserAchievements(user.id);
    } catch (err) {
      logger.error({ err, userId: user.id }, "Salary: error processing achievements");
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Record<string, unknown>)["code"] === "P2002"
  );
}
