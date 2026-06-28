import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { checkUserQualifications } from "./salary-qualification.engine";
import { notificationService } from "../notifications/notifications.service";

// ── Process achievements for a single user ────────────────────────────────────

/**
 * Evaluates ALL salary ranks a user currently qualifies for and creates
 * SalaryAchievement records for any newly qualified ranks.
 *
 * Cumulative Milestone Model (Sprint 23F):
 *   • Multiple active achievements are allowed simultaneously.
 *   • Earning a higher rank NEVER deactivates lower-rank achievements.
 *   • Each rank is earned at most once (@@unique([userId, rankName])).
 *     If the user already has an achievement for a rank, it is silently skipped.
 *
 * Returns the count of new achievements granted.
 */
export async function processUserAchievements(userId: string): Promise<number> {
  const qualifications = await checkUserQualifications(userId);
  const qualifying     = qualifications.filter((q) => q.qualifies);

  if (qualifying.length === 0) return 0;

  let granted = 0;

  for (const q of qualifying) {
    const achievedAt = new Date();
    const expiresAt  = addMonths(achievedAt, q.durationMonths);

    try {
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
        },
      });

      granted++;
      logger.info(
        { userId, rankName: q.rankName, expiresAt },
        "Salary: achievement granted",
      );
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        logger.debug({ userId, rankName: q.rankName }, "Salary: achievement already exists, skipping");
        continue;
      }
      throw err;
    }
  }

  return granted;
}

// ── Bulk scan all ACTIVE users ────────────────────────────────────────────────

/**
 * Runs processUserAchievements for every ACTIVE user.
 * Called by admin trigger or scheduled rank-evaluation cron.
 */
export async function processAllAchievements(): Promise<{
  scanned: number;
  granted: number;
  skipped: number;
  errors:  number;
}> {
  const users = await prisma.user.findMany({
    where:  { status: "ACTIVE" },
    select: { id: true },
  });

  logger.info({ count: users.length }, "Salary: scanning achievements for all active users");

  let granted = 0;
  let skipped = 0;
  let errors  = 0;

  for (const user of users) {
    try {
      const result = await processUserAchievements(user.id);
      if (result > 0) granted += result;
      else            skipped++;
    } catch (err) {
      errors++;
      logger.error({ err, userId: user.id }, "Salary: error processing achievements");
    }
  }

  logger.info({ scanned: users.length, granted, skipped, errors }, "Salary: bulk scan complete");

  return { scanned: users.length, granted, skipped, errors };
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
