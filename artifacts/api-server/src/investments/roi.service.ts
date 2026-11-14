import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { notificationService } from "../notifications/notifications.service";
import { claimSinglePlanRoiTx, lockSinglePlanAccount } from "./single-plan.service";

const ZERO = new Prisma.Decimal("0");

// ── Claim ROI ─────────────────────────────────────────────────────────────────

export async function claimRoi(userId: string, investmentId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const initial = await tx.investment.findUnique({ where: { id: investmentId }, select: { userId: true, planType: true } });
    if (initial?.userId === userId && initial.planType === "SINGLE") await lockSinglePlanAccount(tx, userId);
    const investment = await tx.investment.findUnique({
      where: { id: investmentId },
      select: {
        id:           true,
        userId:       true,
        autoCompound: true,
        claimableROI: true,
        status:       true,
        planType:     true,
      },
    });

    if (!investment || investment.userId !== userId) {
      throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "INVESTMENT_NOT_FOUND");
    }

    if (investment.autoCompound && investment.planType !== "SINGLE") {
      throw new AppError(
        "Auto-compound investments reinvest ROI automatically — there is nothing to claim",
        HTTP_STATUS.BAD_REQUEST,
        "AUTO_COMPOUND_INVESTMENT",
      );
    }

    if (investment.claimableROI.lessThanOrEqualTo(ZERO)) {
      throw new AppError(
        "No claimable ROI available for this investment",
        HTTP_STATUS.BAD_REQUEST,
        "NO_CLAIMABLE_ROI",
      );
    }

    const amount = investment.claimableROI;
    if (investment.planType === "SINGLE") await claimSinglePlanRoiTx(tx, userId, investmentId, amount);

    // Reset claimable ROI on the investment
    await tx.investment.update({
      where: { id: investmentId },
      data: { claimableROI: ZERO },
    });

    // Mark all unclaimed, non-compounded ledger entries as claimed
    const { count: ledgerUpdated } = await tx.roiLedger.updateMany({
      where: {
        investmentId,
        userId,
        wasClaimed:    false,
        wasCompounded: false,
      },
      data: { wasClaimed: true },
    });

    // Credit the income wallet
    const wallet = await tx.wallet.update({
      where: { userId },
      data: { incomeWallet: { increment: amount } },
      select: { id: true, incomeWallet: true },
    });

    // Audit record
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId,
        type:        "ROI_CLAIM",
        status:      "SUCCESS",
        amount,
        description: `ROI claimed — ${investment.planType}`,
        metadata:    { investmentId, ledgerEntriesClaimed: ledgerUpdated },
      },
    });

    return {
      amountClaimed:       amount,
      ledgerEntriesClaimed: ledgerUpdated,
      incomeWalletBalance:  wallet.incomeWallet,
    };
  });

  void notificationService.create({
    userId,
    type:    "ROI_CLAIMED",
    title:   "ROI Claimed",
    message: `You claimed $${result.amountClaimed.toFixed(2)} in ROI earnings, now credited to your income wallet.`,
    metadata: { investmentId, amountClaimed: result.amountClaimed.toString() },
  });

  return result;
}

// ── Earnings summary ──────────────────────────────────────────────────────────

export async function getEarnings(userId: string, investmentId: string) {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: {
      userId:       true,
      claimableROI: true,
      autoCompound: true,
      status:       true,
      planType:     true,
      dailyROI:     true,
      durationDays: true,
    },
  });

  if (!investment || investment.userId !== userId) {
    throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "INVESTMENT_NOT_FOUND");
  }

  // Run three aggregates in a single round-trip
  const [totalAgg, compoundedAgg, claimedAgg, cycleCount] = await prisma.$transaction([
    // Total ROI ever generated (all ledger entries)
    prisma.roiLedger.aggregate({
      where: { investmentId, userId },
      _sum: { amount: true },
    }),
    // Portion that was compounded back into principal
    prisma.roiLedger.aggregate({
      where: { investmentId, userId, wasCompounded: true },
      _sum: { amount: true },
    }),
    // Portion that was actually claimed (moved to income wallet)
    prisma.roiLedger.aggregate({
      where: { investmentId, userId, wasClaimed: true, wasCompounded: false },
      _sum: { amount: true },
    }),
    // Total cycles completed
    prisma.roiLedger.count({ where: { investmentId, userId } }),
  ]);

  return {
    planType:           investment.planType,
    dailyROI:           investment.dailyROI,
    durationDays:       investment.durationDays,
    status:             investment.status,
    autoCompound:       investment.autoCompound,
    cyclesCompleted:    cycleCount,
    totalGenerated:     totalAgg._sum.amount    ?? ZERO,
    totalCompounded:    compoundedAgg._sum.amount ?? ZERO,
    totalClaimed:       claimedAgg._sum.amount  ?? ZERO,
    pendingClaimable:   investment.claimableROI,
  };
}
