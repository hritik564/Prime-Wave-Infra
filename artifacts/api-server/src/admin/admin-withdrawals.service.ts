import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type {
  AdminWithdrawalListQuery,
  ApproveWithdrawalInput,
  CompleteWithdrawalInput,
  RejectWithdrawalInput,
  HoldWithdrawalInput,
  UpdateWithdrawalNotesInput,
} from "../withdrawals/withdrawals.schema";
import { notificationService } from "../notifications/notifications.service";

// ── Shared select ─────────────────────────────────────────────────────────────

const listSelect = {
  id:                    true,
  amount:                true,
  walletAddress:         true,
  walletAddressSnapshot: true,
  network:               true,
  status:                true,
  adminNotes:            true,
  txHash:                true,
  rejectedReason:        true,
  approvedAt:            true,
  completedAt:           true,
  cancelledAt:           true,
  createdAt:             true,
  updatedAt:             true,
  user: {
    select: {
      id:        true,
      username:  true,
      email:     true,
      firstName: true,
      lastName:  true,
      status:    true,
      sponsor: { select: { username: true } },
    },
  },
  approver:  { select: { id: true, email: true, firstName: true, lastName: true } },
  completer: { select: { id: true, email: true, firstName: true, lastName: true } },
} as const;

// ── List (enhanced) ───────────────────────────────────────────────────────────

export async function getAdminWithdrawals(query: AdminWithdrawalListQuery) {
  const { page, limit, status, search, minAmount, maxAmount, dateFrom, dateTo, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.WithdrawalRequestWhereInput = {
    ...(status ? { status } : {}),
    ...(minAmount !== undefined ? { amount: { gte: new Prisma.Decimal(minAmount) } } : {}),
    ...(maxAmount !== undefined ? { amount: { lte: new Prisma.Decimal(maxAmount) } } : {}),
    ...(dateFrom ? { createdAt: { gte: new Date(dateFrom) } } : {}),
    ...(dateTo   ? { createdAt: { lte: new Date(dateTo) } }   : {}),
    ...(search ? {
      OR: [
        { id: { contains: search, mode: "insensitive" } },
        { walletAddress: { contains: search, mode: "insensitive" } },
        { txHash: { contains: search, mode: "insensitive" } },
        { user: { username: { contains: search, mode: "insensitive" } } },
        { user: { email:    { contains: search, mode: "insensitive" } } },
        { user: { id:       { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
  };

  const orderBy: Prisma.WithdrawalRequestOrderByWithRelationInput =
    sortBy === "amount"   ? { amount: sortOrder }   :
    sortBy === "status"   ? { status: sortOrder }   :
    { createdAt: sortOrder };

  const [withdrawals, total] = await prisma.$transaction([
    prisma.withdrawalRequest.findMany({ where, orderBy, skip, take: limit, select: listSelect }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    withdrawals,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Stats (KPI cards) ─────────────────────────────────────────────────────────

export async function getAdminWithdrawalStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalCount,
    pendingAgg,
    approvedCount,
    completedAgg,
    rejectedCount,
    cancelledCount,
    approvedTodayAgg,
    rejectedTodayCount,
  ] = await Promise.all([
    prisma.withdrawalRequest.count(),
    prisma.withdrawalRequest.aggregate({ where: { status: "PENDING"   }, _count: true, _sum: { amount: true } }),
    prisma.withdrawalRequest.count({ where: { status: "APPROVED"  } }),
    prisma.withdrawalRequest.aggregate({ where: { status: "COMPLETED" }, _count: true, _sum: { amount: true } }),
    prisma.withdrawalRequest.count({ where: { status: "REJECTED"  } }),
    prisma.withdrawalRequest.count({ where: { status: "CANCELLED" } }),
    prisma.withdrawalRequest.aggregate({
      where: { status: "COMPLETED", completedAt: { gte: todayStart } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.count({
      where: { status: "REJECTED", updatedAt: { gte: todayStart } },
    }),
  ]);

  const approvedAndCompleted = (approvedCount) + (completedAgg._count ?? 0);
  const decidedTotal = approvedAndCompleted + rejectedCount;
  const successRate = decidedTotal > 0
    ? ((approvedAndCompleted / decidedTotal) * 100).toFixed(1)
    : "0.0";

  return {
    totalCount,
    pendingCount:          pendingAgg._count ?? 0,
    pendingAmount:         (pendingAgg._sum.amount ?? new (require("@prisma/client").Prisma.Decimal)(0)).toFixed(2),
    approvedCount,
    completedCount:        completedAgg._count ?? 0,
    completedAmount:       (completedAgg._sum.amount ?? new (require("@prisma/client").Prisma.Decimal)(0)).toFixed(2),
    rejectedCount,
    cancelledCount,
    approvedToday:         approvedTodayAgg._count ?? 0,
    approvedTodayAmount:   (approvedTodayAgg._sum.amount ?? new (require("@prisma/client").Prisma.Decimal)(0)).toFixed(2),
    rejectedToday:         rejectedTodayCount,
    successRate,
  };
}

// ── Single withdrawal detail ──────────────────────────────────────────────────

export async function getAdminWithdrawalById(withdrawalId: string) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: {
      ...listSelect,
      user: {
        select: {
          id:         true,
          username:   true,
          email:      true,
          firstName:  true,
          lastName:   true,
          status:     true,
          sponsor:    { select: { username: true } },
          wallet:     {
            select: {
              depositWallet:          true,
              incomeWallet:           true,
              withdrawalWallet:       true,
              lockedWithdrawalBalance:true,
            },
          },
        },
      },
    },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }

  const adminLogs = await prisma.adminLog.findMany({
    where: {
      targetUserId: withdrawal.user.id,
      action: { startsWith: "WITHDRAWAL_" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id:        true,
      action:    true,
      details:   true,
      createdAt: true,
      admin: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  const withdrawalLogs = adminLogs.filter((log) => {
    const det = log.details as Record<string, unknown> | null;
    return det && det["withdrawalId"] === withdrawalId;
  });

  return { ...withdrawal, adminLogs: withdrawalLogs };
}

// ── Hold (admin notes annotation, status stays PENDING) ──────────────────────

export async function holdWithdrawal(
  adminId:      string,
  withdrawalId: string,
  input:        HoldWithdrawalInput,
) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: { id: true, userId: true, amount: true, status: true, network: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }
  if (withdrawal.status !== "PENDING") {
    throw new AppError(
      "Only PENDING withdrawals can be placed on hold",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_PENDING",
    );
  }

  const holdNote = `[HOLD] ${input.reason}${input.reviewDate ? ` · Review by: ${input.reviewDate}` : ""}`;

  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data:  { adminNotes: holdNote },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "WITHDRAWAL_ON_HOLD",
        targetUserId: withdrawal.userId,
        details: {
          withdrawalId,
          amount:     withdrawal.amount.toString(),
          network:    withdrawal.network,
          holdReason: input.reason,
          ...(input.reviewDate && { reviewDate: input.reviewDate }),
        },
      },
    });
  });

  return { withdrawalId, status: "PENDING", holdNote };
}

// ── Update admin notes ────────────────────────────────────────────────────────

export async function updateWithdrawalNotes(
  adminId:      string,
  withdrawalId: string,
  input:        UpdateWithdrawalNotesInput,
) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: { id: true, userId: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }

  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data:  { adminNotes: input.adminNotes },
  });

  return { withdrawalId, adminNotes: input.adminNotes };
}

// ── Approve (PENDING → APPROVED) ──────────────────────────────────────────────

export async function approveWithdrawal(
  adminId:      string,
  withdrawalId: string,
  input:        ApproveWithdrawalInput,
) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: { id: true, userId: true, amount: true, status: true, network: true, walletAddress: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }
  if (withdrawal.status !== "PENDING") {
    throw new AppError(
      `Withdrawal is already ${withdrawal.status.toLowerCase()}`,
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_PENDING",
    );
  }

  const approvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data:  {
        status:            "APPROVED",
        approvedByAdminId: adminId,
        approvedAt,
        ...(input.adminNotes !== undefined && { adminNotes: input.adminNotes }),
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "WITHDRAWAL_APPROVED",
        targetUserId: withdrawal.userId,
        details: {
          withdrawalId,
          amount:        withdrawal.amount.toString(),
          network:       withdrawal.network,
          walletAddress: withdrawal.walletAddress,
          ...(input.adminNotes && { adminNotes: input.adminNotes }),
        },
      },
    });
  });

  void notificationService.create({
    userId:  withdrawal.userId,
    type:    "WITHDRAWAL_APPROVED",
    title:   "Withdrawal Approved",
    message: `Your withdrawal of $${withdrawal.amount.toFixed(2)} (${withdrawal.network}) has been approved and is being processed.`,
    metadata: { withdrawalId, amount: withdrawal.amount.toString(), network: withdrawal.network },
  });

  return { withdrawalId, status: "APPROVED", approvedAt };
}

// ── Complete (APPROVED → COMPLETED) ──────────────────────────────────────────

export async function completeWithdrawal(
  adminId:      string,
  withdrawalId: string,
  input:        CompleteWithdrawalInput,
) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: { id: true, userId: true, amount: true, status: true, network: true, walletAddress: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }
  if (withdrawal.status !== "APPROVED") {
    throw new AppError(
      "Only APPROVED withdrawals can be completed",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_APPROVED",
    );
  }

  const completedAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.update({
        where: { id: withdrawalId },
        data:  {
          status:             "COMPLETED",
          completedByAdminId: adminId,
          completedAt,
          txHash:             input.txHash,
          ...(input.adminNotes !== undefined && { adminNotes: input.adminNotes }),
        },
      });

      const wallet = await tx.wallet.update({
        where: { userId: withdrawal.userId },
        data:  { lockedWithdrawalBalance: { decrement: withdrawal.amount } },
        select: { id: true },
      });

      await tx.walletTransaction.create({
        data: {
          walletId:    wallet.id,
          userId:      withdrawal.userId,
          type:        "WITHDRAWAL",
          status:      "SUCCESS",
          amount:      withdrawal.amount,
          description: `Withdrawal completed — ${withdrawal.network} to ${withdrawal.walletAddress.slice(0, 10)}…`,
          metadata:    {
            withdrawalId,
            network:       withdrawal.network,
            walletAddress: withdrawal.walletAddress,
            txHash:        input.txHash,
            completedBy:   adminId,
          },
        },
      });

      await tx.adminLog.create({
        data: {
          adminId,
          action:       "WITHDRAWAL_COMPLETED",
          targetUserId: withdrawal.userId,
          details: {
            withdrawalId,
            amount:        withdrawal.amount.toString(),
            network:       withdrawal.network,
            walletAddress: withdrawal.walletAddress,
            txHash:        input.txHash,
          },
        },
      });
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" && err !== null &&
      "code" in err && (err as Record<string, unknown>)["code"] === "P2002"
    ) {
      throw new AppError(
        "Transaction hash already recorded for another withdrawal",
        HTTP_STATUS.CONFLICT,
        "DUPLICATE_TX_HASH",
      );
    }
    throw err;
  }

  void notificationService.create({
    userId:  withdrawal.userId,
    type:    "WITHDRAWAL_COMPLETED",
    title:   "Withdrawal Completed",
    message: `Your withdrawal of $${withdrawal.amount.toFixed(2)} (${withdrawal.network}) has been sent on-chain. Tx: ${input.txHash.slice(0, 12)}…`,
    metadata: { withdrawalId, amount: withdrawal.amount.toString(), network: withdrawal.network, txHash: input.txHash },
  });

  return { withdrawalId, status: "COMPLETED", completedAt, txHash: input.txHash };
}

// ── Reject (PENDING | APPROVED → REJECTED) ───────────────────────────────────

export async function rejectWithdrawal(
  adminId:      string,
  withdrawalId: string,
  input:        RejectWithdrawalInput,
) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: { id: true, userId: true, amount: true, status: true, network: true, walletAddress: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }
  if (withdrawal.status !== "PENDING" && withdrawal.status !== "APPROVED") {
    throw new AppError(
      "Only PENDING or APPROVED withdrawals can be rejected",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_REJECTABLE",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data:  {
        status:         "REJECTED",
        rejectedReason: input.rejectedReason,
        ...(input.adminNotes !== undefined && { adminNotes: input.adminNotes }),
      },
    });

    const wallet = await tx.wallet.update({
      where: { userId: withdrawal.userId },
      data:  {
        lockedWithdrawalBalance: { decrement: withdrawal.amount },
        withdrawalWallet:        { increment: withdrawal.amount },
      },
      select: { id: true },
    });

    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId:      withdrawal.userId,
        type:        "WITHDRAWAL",
        status:      "FAILED",
        amount:      withdrawal.amount,
        description: `Withdrawal rejected — refunded to withdrawal wallet`,
        metadata:    {
          withdrawalId,
          network:        withdrawal.network,
          walletAddress:  withdrawal.walletAddress,
          rejectedReason: input.rejectedReason,
          rejectedBy:     adminId,
        },
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "WITHDRAWAL_REJECTED",
        targetUserId: withdrawal.userId,
        details: {
          withdrawalId,
          amount:         withdrawal.amount.toString(),
          network:        withdrawal.network,
          walletAddress:  withdrawal.walletAddress,
          rejectedReason: input.rejectedReason,
        },
      },
    });
  });

  void notificationService.create({
    userId:  withdrawal.userId,
    type:    "WITHDRAWAL_REJECTED",
    title:   "Withdrawal Rejected",
    message: `Your withdrawal of $${withdrawal.amount.toFixed(2)} (${withdrawal.network}) was rejected and refunded. Reason: ${input.rejectedReason}`,
    metadata: { withdrawalId, amount: withdrawal.amount.toString(), network: withdrawal.network, reason: input.rejectedReason },
  });

  return { withdrawalId, status: "REJECTED" };
}
