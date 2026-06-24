import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminDepositListQuery, RejectDepositInput } from "../deposits/deposits.schema";
import { notificationService } from "../notifications/notifications.service";

// ── Pending deposits list ─────────────────────────────────────────────────────

const pendingSelect = {
  id:            true,
  amount:        true,
  network:       true,
  txHash:        true,
  screenshotUrl: true,
  companyWallet: true,
  status:        true,
  createdAt:     true,
  user: {
    select: { id: true, username: true, email: true, firstName: true, lastName: true },
  },
} as const;

export async function getPendingDeposits(query: AdminDepositListQuery) {
  const { page, limit, network } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.DepositRequestWhereInput = {
    status: "PENDING",
    ...(network && { network }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.depositRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },   // oldest first — FIFO review queue
      skip,
      take:    limit,
      select:  pendingSelect,
    }),
    prisma.depositRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getDepositStats() {
  const [pending, approved, rejected, approvedAgg] = await prisma.$transaction([
    prisma.depositRequest.count({ where: { status: "PENDING" } }),
    prisma.depositRequest.count({ where: { status: "APPROVED" } }),
    prisma.depositRequest.count({ where: { status: "REJECTED" } }),
    prisma.depositRequest.aggregate({
      where: { status: "APPROVED" },
      _sum:  { amount: true },
    }),
  ]);

  return {
    counts: {
      pending,
      approved,
      rejected,
      total: pending + approved + rejected,
    },
    totalApprovedAmount: approvedAgg._sum.amount ?? new Prisma.Decimal(0),
  };
}

// ── Approve ───────────────────────────────────────────────────────────────────

/**
 * Approves a PENDING deposit request.
 *
 * Atomically:
 *   1. Marks deposit APPROVED.
 *   2. Credits user's depositWallet.
 *   3. Creates WalletTransaction (type DEPOSIT).
 *   4. Creates AdminLog.
 */
export async function approveDeposit(adminId: string, depositId: string) {
  // Load deposit outside transaction — fail fast if wrong state
  const deposit = await prisma.depositRequest.findUnique({
    where:  { id: depositId },
    select: { id: true, userId: true, amount: true, status: true, txHash: true, network: true },
  });

  if (!deposit) {
    throw new AppError("Deposit not found", HTTP_STATUS.NOT_FOUND, "DEPOSIT_NOT_FOUND");
  }
  if (deposit.status !== "PENDING") {
    throw new AppError(
      `Deposit is already ${deposit.status.toLowerCase()}`,
      HTTP_STATUS.CONFLICT,
      "DEPOSIT_NOT_PENDING",
    );
  }

  const approvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    // 1. Mark approved
    await tx.depositRequest.update({
      where: { id: depositId },
      data: {
        status:            "APPROVED",
        approvedByAdminId: adminId,
        approvedAt,
      },
    });

    // 2. Credit deposit wallet
    const wallet = await tx.wallet.update({
      where: { userId: deposit.userId },
      data:  { depositWallet: { increment: deposit.amount } },
      select: { id: true },
    });

    // 3. WalletTransaction record
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId:      deposit.userId,
        type:        "DEPOSIT",
        status:      "SUCCESS",
        amount:      deposit.amount,
        description: `Crypto deposit approved — ${deposit.network} (${deposit.txHash.slice(0, 12)}…)`,
        metadata:    { depositId, network: deposit.network, txHash: deposit.txHash, approvedBy: adminId },
      },
    });

    // 4. AdminLog
    await tx.adminLog.create({
      data: {
        adminId,
        action:       "DEPOSIT_APPROVED",
        targetUserId: deposit.userId,
        details: {
          depositId,
          amount:  deposit.amount.toString(),
          network: deposit.network,
          txHash:  deposit.txHash,
        },
      },
    });
  });

  void notificationService.create({
    userId:  deposit.userId,
    type:    "DEPOSIT_APPROVED",
    title:   "Deposit Approved",
    message: `Your deposit of $${deposit.amount.toFixed(2)} (${deposit.network}) has been approved and credited to your account.`,
    metadata: { depositId, amount: deposit.amount.toString(), network: deposit.network },
  });

  return { depositId, status: "APPROVED", approvedAt };
}

// ── Reject ────────────────────────────────────────────────────────────────────

/**
 * Rejects a PENDING deposit request with a mandatory reason.
 * No wallet changes — only status update + AdminLog.
 */
export async function rejectDeposit(
  adminId:   string,
  depositId: string,
  input:     RejectDepositInput,
) {
  const deposit = await prisma.depositRequest.findUnique({
    where:  { id: depositId },
    select: { id: true, userId: true, amount: true, status: true, txHash: true, network: true },
  });

  if (!deposit) {
    throw new AppError("Deposit not found", HTTP_STATUS.NOT_FOUND, "DEPOSIT_NOT_FOUND");
  }
  if (deposit.status !== "PENDING") {
    throw new AppError(
      `Deposit is already ${deposit.status.toLowerCase()}`,
      HTTP_STATUS.CONFLICT,
      "DEPOSIT_NOT_PENDING",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.depositRequest.update({
      where: { id: depositId },
      data: {
        status:         "REJECTED",
        rejectedReason: input.rejectedReason,
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "DEPOSIT_REJECTED",
        targetUserId: deposit.userId,
        details: {
          depositId,
          amount:         deposit.amount.toString(),
          network:        deposit.network,
          txHash:         deposit.txHash,
          rejectedReason: input.rejectedReason,
        },
      },
    });
  });

  void notificationService.create({
    userId:  deposit.userId,
    type:    "DEPOSIT_REJECTED",
    title:   "Deposit Rejected",
    message: `Your deposit of $${deposit.amount.toFixed(2)} (${deposit.network}) was rejected. Reason: ${input.rejectedReason}`,
    metadata: { depositId, amount: deposit.amount.toString(), network: deposit.network, reason: input.rejectedReason },
  });

  return { depositId, status: "REJECTED" };
}
