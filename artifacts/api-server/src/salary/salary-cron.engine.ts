import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { notificationService } from "../notifications/notifications.service";
import { isMemberActive } from "../eligibility/eligibility.service";

// ── Monthly salary payout engine ──────────────────────────────────────────────

/**
 * Runs on the 1st of each month (Europe/London midnight).
 *
 * For every active SalaryAchievement:
 *   1. If expired → mark isActive = false, skip payout.
 *   2. Check idempotency key (userId, rankName, month, year) — skip if paid.
 *   3. Credit monthlyAmount to user's withdrawalWallet.
 *   4. Create WalletTransaction (type SALARY_INCOME).
 *   5. Create SalaryIncome record.
 *
 * Salaries stack — all active achievements are paid in the same run.
 * All writes per achievement are wrapped in a Prisma transaction.
 */
export async function runSalaryCycle(now?: Date): Promise<void> {
  const cycleDate = now ?? new Date();

  // Derive month + year in Europe/London to stay consistent with the cron boundary
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year:     "numeric",
    month:    "numeric",
  });
  const parts  = fmt.formatToParts(cycleDate);
  const month  = Number(parts.find((p) => p.type === "month")?.value ?? cycleDate.getUTCMonth() + 1);
  const year   = Number(parts.find((p) => p.type === "year")?.value  ?? cycleDate.getUTCFullYear());

  logger.info({ month, year }, "Salary cron: starting payout cycle");

  // Load all active achievements (isActive = true)
  const achievements = await prisma.salaryAchievement.findMany({
    where:  { isActive: true },
    select: {
      id:            true,
      userId:        true,
      rankName:      true,
      monthlyAmount: true,
      expiresAt:     true,
    },
  });

  logger.info({ count: achievements.length }, "Salary cron: active achievements found");

  let paid     = 0;
  let expired  = 0;
  let skipped  = 0;

  for (const ach of achievements) {
    // ── 1. Expire if past expiresAt ─────────────────────────────────────────
    if (ach.expiresAt <= cycleDate) {
      await prisma.salaryAchievement.update({
        where: { id: ach.id },
        data:  { isActive: false },
      });
      expired++;
      logger.info({ userId: ach.userId, rankName: ach.rankName }, "Salary cron: achievement expired");
      continue;
    }

    // ── 1b. Active member qualification ──────────────────────────────────────
    const memberActive = await isMemberActive(ach.userId);
    if (!memberActive) {
      skipped++;
      logger.info({ userId: ach.userId, rankName: ach.rankName }, "Salary cron: user is not an active member, skipping");
      continue;
    }

    // ── 2. Idempotency: skip if already paid this month ──────────────────────
    const already = await prisma.salaryIncome.findUnique({
      where: {
        userId_rankName_month_year: {
          userId:   ach.userId,
          rankName: ach.rankName,
          month,
          year,
        },
      },
    });
    if (already) {
      skipped++;
      continue;
    }

    // ── 3–5. Credit wallet + create records atomically ───────────────────────
    try {
      await prisma.$transaction(async (tx) => {
        // Credit withdrawalWallet
        const wallet = await tx.wallet.update({
          where: { userId: ach.userId },
          data:  { withdrawalWallet: { increment: ach.monthlyAmount } },
          select: { id: true },
        });

        // WalletTransaction audit trail
        await tx.walletTransaction.create({
          data: {
            walletId:    wallet.id,
            userId:      ach.userId,
            type:        "SALARY",
            status:      "SUCCESS",
            amount:      ach.monthlyAmount,
            description: `${ach.rankName} leadership salary — ${monthName(month)} ${year}`,
            metadata:    { rankName: ach.rankName, month, year },
          },
        });

        // SalaryIncome ledger record
        await tx.salaryIncome.create({
          data: {
            userId:   ach.userId,
            rankName: ach.rankName,
            month,
            year,
            amount:   ach.monthlyAmount,
          },
        });
      });

      void notificationService.create({
        userId:  ach.userId,
        type:    "SALARY_RECEIVED",
        title:   "Leadership Salary Received",
        message: `Your ${ach.rankName} leadership salary of $${ach.monthlyAmount.toFixed(2)} for ${monthName(month)} ${year} has been credited to your withdrawal wallet.`,
        metadata: { rankName: ach.rankName, amount: ach.monthlyAmount.toString(), month, year },
      });

      paid++;
      logger.info(
        { userId: ach.userId, rankName: ach.rankName, amount: ach.monthlyAmount.toString(), month, year },
        "Salary cron: payout processed",
      );
    } catch (err) {
      logger.error({ err, userId: ach.userId, rankName: ach.rankName }, "Salary cron: payout failed");
    }
  }

  logger.info({ paid, expired, skipped }, "Salary cron: cycle complete");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthName(m: number): string {
  return MONTHS[m] ?? String(m);
}
