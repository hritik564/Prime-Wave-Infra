import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { getHighestQualifyingRank } from "./salary-qualification.engine";
import { notificationService } from "../notifications/notifications.service";

// ── Process achievements for a single user ────────────────────────────────────

/**
 * Evaluates the highest salary rank a user qualifies for and updates their
 * SalaryAchievement accordingly.
 *
 * Rules (Sprint 23E):
 *   • A member holds AT MOST ONE active SalaryAchievement at any time.
 *   • If they qualify for a higher rank than their current active one:
 *       — Deactivate the current achievement.
 *       — Create (or reactivate) the new higher achievement.
 *   • If they already hold the highest qualifying rank: no-op.
 *   • If they no longer qualify for any rank: no-op (achievements are never
 *     automatically revoked — expiry is handled by the salary cron).
 *
 * Returns 1 if a new achievement was granted, 0 otherwise.
 */
export async function processUserAchievements(userId: string): Promise<number> {
  const highest = await getHighestQualifyingRank(userId);

  if (!highest) return 0;

  const currentActive = await prisma.salaryAchievement.findFirst({
    where:   { userId, isActive: true },
    orderBy: { monthlyAmount: "desc" },
  });

  if (currentActive?.rankName === highest.rankName) {
    return 0;
  }

  if (currentActive) {
    await prisma.salaryAchievement.update({
      where: { id: currentActive.id },
      data:  { isActive: false },
    });
    logger.info(
      { userId, deactivated: currentActive.rankName, promoted: highest.rankName },
      "Salary: deactivating lower rank achievement",
    );
  }

  const achievedAt = new Date();
  const expiresAt  = addMonths(achievedAt, highest.durationMonths);

  await prisma.salaryAchievement.upsert({
    where:  { userId_rankName: { userId, rankName: highest.rankName } },
    create: {
      userId,
      rankName:      highest.rankName,
      achievedAt,
      expiresAt,
      monthlyAmount: highest.monthlySalary,
      isActive:      true,
    },
    update: {
      achievedAt,
      expiresAt,
      monthlyAmount: highest.monthlySalary,
      isActive:      true,
    },
  });

  void notificationService.create({
    userId,
    type:    "RANK_ACHIEVED",
    title:   "Leadership Salary Rank Achieved",
    message: `Congratulations! You have qualified for the ${highest.rankName} leadership salary rank and will receive $${highest.monthlySalary.toFixed(2)}/month for ${highest.durationMonths} months.`,
    metadata: {
      rankName:          highest.rankName,
      monthlySalary:     highest.monthlySalary.toString(),
      totalBusinessUSD:  highest.totalBusinessUSD?.toString() ?? "0",
      leftBusinessUSD:   highest.leftBusinessUSD?.toString()  ?? "0",
      rightBusinessUSD:  highest.rightBusinessUSD?.toString() ?? "0",
      expiresAt:         expiresAt.toISOString(),
    },
  });

  logger.info(
    { userId, rankName: highest.rankName, expiresAt, monthly: highest.monthlySalary.toString() },
    "Salary: achievement granted",
  );

  return 1;
}

// ── Bulk scan all ACTIVE users ────────────────────────────────────────────────

/**
 * Runs processUserAchievements for every ACTIVE user.
 * Called by admin trigger or scheduled rank-evaluation cron.
 * Returns a summary of how many achievements were granted vs skipped.
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
      if (result > 0) granted++;
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
