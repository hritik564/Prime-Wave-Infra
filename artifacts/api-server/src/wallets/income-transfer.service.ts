import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";

const TOTAL_HOURS = 72;
const FEE_RATE    = new Prisma.Decimal("0.15"); // 15% one-time transfer fee

// ── Create transfer ────────────────────────────────────────────────────────────

/**
 * Enqueue an income→withdrawal transfer.
 *
 * Business rules (locked):
 *   1. Deduct a one-time 15% transfer fee from the requested amount.
 *   2. The remaining 85% (netAmount) enters the 72-hour release engine.
 *   3. Income wallet is debited by the full originalAmount.
 *   4. The fee is never credited to withdrawalWallet — only the net releases are.
 */
export async function createIncomeTransfer(userId: string, amount: number) {
  const originalAmount = new Prisma.Decimal(amount.toString());
  const transferFee    = originalAmount.mul(FEE_RATE);
  const netAmount      = originalAmount.sub(transferFee);
  const hourlySlice    = netAmount.div(new Prisma.Decimal(TOTAL_HOURS));
  const nextReleaseAt  = new Date(Date.now() + 60 * 60 * 1000); // +1 hour

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where:  { userId },
      select: { id: true, incomeWallet: true },
    });

    if (!wallet) {
      throw new AppError("Wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
    }

    if (wallet.incomeWallet.lessThan(originalAmount)) {
      throw new AppError(
        `Insufficient income wallet balance. Available: $${wallet.incomeWallet.toFixed(2)}`,
        HTTP_STATUS.BAD_REQUEST,
        "INSUFFICIENT_BALANCE",
      );
    }

    // Deduct full original amount from income wallet immediately
    await tx.wallet.update({
      where: { userId },
      data:  { incomeWallet: { decrement: originalAmount } },
    });

    // Audit record — reflects the full deduction including fee
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId,
        type:        "INCOME_TRANSFER",
        status:      "SUCCESS",
        amount:      originalAmount,
        description: "Income transfer queued — 15% fee applied, 72-hour release started",
        metadata: {
          originalAmount: originalAmount.toFixed(8),
          transferFee:    transferFee.toFixed(8),
          netAmount:      netAmount.toFixed(8),
          feeRate:        "15%",
          totalHours:     TOTAL_HOURS,
          hourlySlice:    hourlySlice.toFixed(8),
        } as Prisma.InputJsonValue,
      },
    });

    // Create transfer record — remainingAmount and hourlySlice are based on netAmount
    const transfer = await tx.incomeTransfer.create({
      data: {
        userId,
        totalAmount:     originalAmount,
        transferFee,
        netAmount,
        releasedAmount:  new Prisma.Decimal(0),
        remainingAmount: netAmount,
        hourlySlice,
        hoursCompleted:  0,
        status:          "ACTIVE",
        nextReleaseAt,
      },
    });

    return {
      id:              transfer.id,
      totalAmount:     transfer.totalAmount.toFixed(8),
      transferFee:     transfer.transferFee!.toFixed(8),
      netAmount:       transfer.netAmount!.toFixed(8),
      releasedAmount:  transfer.releasedAmount.toFixed(8),
      remainingAmount: transfer.remainingAmount.toFixed(8),
      hourlySlice:     transfer.hourlySlice.toFixed(8),
      hoursCompleted:  transfer.hoursCompleted,
      status:          transfer.status,
      nextReleaseAt:   transfer.nextReleaseAt,
      createdAt:       transfer.createdAt,
    };
  });
}

// ── List transfers ─────────────────────────────────────────────────────────────

export async function listIncomeTransfers(userId: string, page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  const [transfers, total] = await prisma.$transaction([
    prisma.incomeTransfer.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      include: {
        releases: {
          orderBy: { hourNumber: "desc" },
          take:    5,
        },
      },
    }),
    prisma.incomeTransfer.count({ where: { userId } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: transfers.map(formatTransfer),
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Single transfer ────────────────────────────────────────────────────────────

export async function getIncomeTransfer(userId: string, transferId: string) {
  const transfer = await prisma.incomeTransfer.findFirst({
    where:   { id: transferId, userId },
    include: {
      releases: {
        orderBy: { hourNumber: "desc" },
      },
    },
  });

  if (!transfer) {
    throw new AppError("Transfer not found", HTTP_STATUS.NOT_FOUND, "TRANSFER_NOT_FOUND");
  }

  return formatTransfer(transfer);
}

// ── Formatter ──────────────────────────────────────────────────────────────────

type TransferWithReleases = Awaited<ReturnType<typeof prisma.incomeTransfer.findFirst>> & {
  releases?: { id: string; hourNumber: number; amount: Prisma.Decimal; createdAt: Date }[];
};

function formatTransfer(t: NonNullable<TransferWithReleases>) {
  const pct = t.hoursCompleted / TOTAL_HOURS;
  const estimatedCompletionAt = t.status === "COMPLETED"
    ? t.completedAt
    : new Date(t.createdAt.getTime() + TOTAL_HOURS * 60 * 60 * 1000);

  return {
    id:                    t.id,
    totalAmount:           t.totalAmount.toFixed(8),
    transferFee:           t.transferFee?.toFixed(8) ?? null,
    netAmount:             t.netAmount?.toFixed(8) ?? null,
    releasedAmount:        t.releasedAmount.toFixed(8),
    remainingAmount:       t.remainingAmount.toFixed(8),
    hourlySlice:           t.hourlySlice.toFixed(8),
    hoursCompleted:        t.hoursCompleted,
    hoursRemaining:        Math.max(0, TOTAL_HOURS - t.hoursCompleted),
    completionPercent:     Math.min(100, Math.round(pct * 100)),
    status:                t.status,
    nextReleaseAt:         t.nextReleaseAt,
    estimatedCompletionAt,
    createdAt:             t.createdAt,
    completedAt:           t.completedAt,
    releases:              (t.releases ?? []).map((r) => ({
      id:         r.id,
      hourNumber: r.hourNumber,
      amount:     r.amount.toFixed(8),
      createdAt:  r.createdAt,
    })),
  };
}
