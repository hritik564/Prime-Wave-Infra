import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

const TOTAL_HOURS = 72;

/**
 * Processes all pending hourly releases for active income transfers.
 *
 * Called every hour by the scheduler.
 *
 * For each ACTIVE IncomeTransfer where nextReleaseAt <= now:
 *   1. Release the pre-computed hourlySlice (or remaining for the final hour).
 *   2. Credit the user's withdrawalWallet.
 *   3. Create an IncomeTransferRelease record.
 *   4. Increment hoursCompleted, update releasedAmount + remainingAmount.
 *   5. If hoursCompleted == 72 → mark COMPLETED, set completedAt.
 *   6. Otherwise → advance nextReleaseAt by 1 hour.
 *
 * Each transfer is wrapped in its own transaction so a single failure
 * does not abort the entire batch.
 */
export async function processTransferReleases(): Promise<void> {
  const now = new Date();

  const due = await prisma.incomeTransfer.findMany({
    where: {
      status:        "ACTIVE",
      nextReleaseAt: { lte: now },
    },
    select: {
      id:             true,
      userId:         true,
      totalAmount:    true,
      releasedAmount: true,
      remainingAmount: true,
      hourlySlice:    true,
      hoursCompleted: true,
    },
    orderBy: { nextReleaseAt: "asc" },
  });

  if (due.length === 0) {
    logger.info("Transfer engine: no releases due");
    return;
  }

  logger.info({ count: due.length }, "Transfer engine: processing releases");

  let released = 0;
  let completed = 0;
  let failed    = 0;

  for (const transfer of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const nextHour = transfer.hoursCompleted + 1;
        const isFinal  = nextHour >= TOTAL_HOURS;

        // On the final hour, release whatever remains (avoids rounding drift)
        const releaseAmount = isFinal
          ? transfer.remainingAmount
          : transfer.hourlySlice;

        const newReleased   = transfer.releasedAmount.add(releaseAmount);
        const newRemaining  = isFinal
          ? new Prisma.Decimal(0)
          : transfer.remainingAmount.sub(releaseAmount);

        // Credit withdrawal wallet
        const wallet = await tx.wallet.findUnique({
          where:  { userId: transfer.userId },
          select: { id: true },
        });
        if (!wallet) throw new Error(`Wallet not found for user ${transfer.userId}`);

        await tx.wallet.update({
          where: { userId: transfer.userId },
          data:  { withdrawalWallet: { increment: releaseAmount } },
        });

        // Audit record
        await tx.walletTransaction.create({
          data: {
            walletId:    wallet.id,
            userId:      transfer.userId,
            type:        "INCOME_TRANSFER",
            status:      "SUCCESS",
            amount:      releaseAmount,
            description: `Transfer release — hour ${nextHour} of ${TOTAL_HOURS}`,
            metadata: {
              transferId:  transfer.id,
              hourNumber:  nextHour,
              totalAmount: transfer.totalAmount.toFixed(8),
            } as Prisma.InputJsonValue,
          },
        });

        // Release record
        await tx.incomeTransferRelease.create({
          data: {
            transferId: transfer.id,
            hourNumber: nextHour,
            amount:     releaseAmount,
          },
        });

        // Update transfer record
        await tx.incomeTransfer.update({
          where: { id: transfer.id },
          data: {
            hoursCompleted:  nextHour,
            releasedAmount:  newReleased,
            remainingAmount: newRemaining,
            status:          isFinal ? "COMPLETED" : "ACTIVE",
            completedAt:     isFinal ? now : undefined,
            nextReleaseAt:   isFinal ? undefined : new Date(now.getTime() + 60 * 60 * 1000),
          },
        });
      });

      released++;
      if (transfer.hoursCompleted + 1 >= TOTAL_HOURS) completed++;
    } catch (err) {
      failed++;
      logger.error({ err, transferId: transfer.id }, "Transfer engine: release failed");
    }
  }

  logger.info({ released, completed, failed }, "Transfer engine: batch complete");
}
