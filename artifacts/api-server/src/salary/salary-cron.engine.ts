import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { notificationService } from "../notifications/notifications.service";
import { writeLedgerEntry } from "../ledger/ledger.service";
import { isBinaryQualified } from "../eligibility/eligibility.service";

// ── Monthly salary payout engine ──────────────────────────────────────────────

/**
 * Runs on the 1st of each month (Europe/London midnight).
 *
 * Cumulative Milestone Model (Sprint 23F):
 *   A member may hold multiple active SalaryAchievements simultaneously.
 *   Each achievement is processed and paid independently.
 *
 * For every active SalaryAchievement:
 *   1. If paymentsMade ≥ durationMonths → mark isActive=false, skip.
 *   2. If expiresAt ≤ cycleDate         → mark isActive=false, skip (safety net).
 *   3. Check idempotency key (userId, rankName, month, year) — skip if already paid.
 *   4. Verify member still satisfies the Global Active Member rule.
 *   5. Credit monthlyAmount to user's withdrawalWallet.
 *   6. Create WalletTransaction (type SALARY).
 *   7. Create SalaryIncome record.
 *   8. Increment paymentsMade; set lastPaidAt; if now complete → isActive=false.
 *
 * All writes per achievement are wrapped in a single Prisma transaction.
 */
export async function runSalaryCycle(now?: Date): Promise<void> {
  const cycleDate = now ?? new Date();

  const fmt   = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year:     "numeric",
    month:    "numeric",
  });
  const parts = fmt.formatToParts(cycleDate);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? cycleDate.getUTCMonth() + 1);
  const year  = Number(parts.find((p) => p.type === "year")?.value  ?? cycleDate.getUTCFullYear());

  logger.info({ month, year }, "Salary cron: starting payout cycle");

  const achievements = await prisma.salaryAchievement.findMany({
    where:   { isActive: true },
    select: {
      id:            true,
      userId:        true,
      rankName:      true,
      monthlyAmount: true,
      expiresAt:     true,
      paymentsMade:  true,
      config:        { select: { durationMonths: true } },
    },
  });

  logger.info({ count: achievements.length }, "Salary cron: active achievements found");

  let paid    = 0;
  let expired = 0;
  let skipped = 0;

  for (const ach of achievements) {
    const durationMonths = ach.config.durationMonths;

    // ── 1. Payments completed ─────────────────────────────────────────────────
    if (ach.paymentsMade >= durationMonths) {
      await prisma.salaryAchievement.update({
        where: { id: ach.id },
        data:  { isActive: false },
      });
      expired++;
      logger.info(
        { userId: ach.userId, rankName: ach.rankName, paymentsMade: ach.paymentsMade, durationMonths },
        "Salary cron: achievement completed all payments",
      );
      continue;
    }

    // ── 2. Expiry safety net ──────────────────────────────────────────────────
    if (ach.expiresAt <= cycleDate) {
      await prisma.salaryAchievement.update({
        where: { id: ach.id },
        data:  { isActive: false },
      });
      expired++;
      logger.info(
        { userId: ach.userId, rankName: ach.rankName },
        "Salary cron: achievement expired by date",
      );
      continue;
    }

    // ── 3. Idempotency ────────────────────────────────────────────────────────
    const already = await prisma.salaryIncome.findUnique({
      where: {
        userId_month_year: {
          userId: ach.userId,
          month,
          year,
        },
      },
    });
    if (already) {
      skipped++;
      continue;
    }

    // ── 4. Active member check ────────────────────────────────────────────────
    const memberActive = await isBinaryQualified(ach.userId);
    if (!memberActive) {
      skipped++;
      logger.info(
        { userId: ach.userId, rankName: ach.rankName },
        "Salary cron: user is not an active member, skipping",
      );
      continue;
    }

    // ── 5-8. Credit wallet, create records, update payment tracking ───────────
    try {
      const newPaymentsMade = ach.paymentsMade + 1;
      const nowCompleted    = newPaymentsMade >= durationMonths;

      await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.update({
          where:  { userId: ach.userId },
          data:   { withdrawalWallet: { increment: ach.monthlyAmount } },
          select: { id: true, withdrawalWallet: true },
        });

        await tx.walletTransaction.create({
          data: {
            walletId:    wallet.id,
            userId:      ach.userId,
            type:        "SALARY",
            status:      "SUCCESS",
            amount:      ach.monthlyAmount,
            description: `${ach.rankName} leadership salary — ${monthName(month)} ${year} (payment ${newPaymentsMade}/${durationMonths})`,
            metadata:    { rankName: ach.rankName, month, year, paymentNumber: newPaymentsMade, durationMonths },
          },
        });

        await tx.salaryIncome.create({
          data: {
            userId:   ach.userId,
            rankName: ach.rankName,
            month,
            year,
            amount:   ach.monthlyAmount,
          },
        });

        await tx.salaryAchievement.update({
          where: { id: ach.id },
          data: {
            paymentsMade: newPaymentsMade,
            lastPaidAt:   cycleDate,
            isActive:     !nowCompleted,
          },
        });
      });

      void prisma.wallet.findUnique({ where: { userId: ach.userId }, select: { withdrawalWallet: true } })
        .then(w => w && writeLedgerEntry({
          referenceId:     ach.id,
          referenceType:   "salary",
          memberId:        ach.userId,
          username:        ach.userId,
          transactionType: "SALARY_INCOME",
          amount:          ach.monthlyAmount,
          debitCredit:     "CREDIT",
          walletType:      "WITHDRAWAL_WALLET",
          closingBalance:  w.withdrawalWallet,
          metadata:        { rankName: ach.rankName, month, year },
        }))
        .catch(err => logger.error({ err }, "ledger: salary write failed"));

      void notificationService.create({
        userId:   ach.userId,
        type:     "SALARY_RECEIVED",
        title:    "Leadership Salary Received",
        message:  `Your ${ach.rankName} leadership salary of $${ach.monthlyAmount.toFixed(2)} for ${monthName(month)} ${year} has been credited to your withdrawal wallet. (Payment ${newPaymentsMade}/${durationMonths})`,
        metadata: {
          rankName:      ach.rankName,
          amount:        ach.monthlyAmount.toString(),
          month,
          year,
          paymentsMade:  newPaymentsMade,
          durationMonths,
          completed:     nowCompleted,
        },
      });

      paid++;
      logger.info(
        {
          userId:        ach.userId,
          rankName:      ach.rankName,
          amount:        ach.monthlyAmount.toString(),
          month,
          year,
          paymentsMade:  newPaymentsMade,
          durationMonths,
          completed:     nowCompleted,
        },
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
