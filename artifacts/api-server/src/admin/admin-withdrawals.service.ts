import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminWithdrawalListQuery, ApproveWithdrawalInput, CompleteWithdrawalInput, RejectWithdrawalInput } from "../withdrawals/withdrawals.schema";

// ── List pending / filtered withdrawals ───────────────────────────────────────

const pendingSelect = {
  id:                    true,
  amount:                true,
  walletAddress:         true,
  walletAddressSnapshot: true,
  network:               true,
  status:                true,
  adminNotes:            true,
  createdAt:             true,
  approvedAt:            true,
  user: {
    select: { id: true, username: true, email: true, firstName: true, lastName: true },
  },
} as const;

export async function getAdminWithdrawals(query: AdminWithdrawalListQuery) {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.WithdrawalRequestWhereInput = {
    ...(status ? { status } : { status: "PENDING" }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: "asc" },   // FIFO review queue
      skip,
      take:    limit,
      select:  pendingSelect,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Approve (PENDING → APPROVED) ──────────────────────────────────────────────

/**
 * Marks a withdrawal as APPROVED (admin has verified the request off-chain).
 * No balance movement — funds remain locked until COMPLETE.
 * Creates an AdminLog.
 */
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

  return { withdrawalId, status: "APPROVED", approvedAt };
}

// ── Complete (APPROVED → COMPLETED) ──────────────────────────────────────────

/**
 * Marks a withdrawal as COMPLETED after the admin has broadcast the on-chain
 * transaction and provides the txHash.
 *
 * Atomically:
 *   1. Sets status COMPLETED, stores txHash and completedAt.
 *   2. Releases lockedWithdrawalBalance (funds are now gone from the system).
 *   3. Creates a WalletTransaction (type WITHDRAWAL, status SUCCESS).
 *   4. Creates an AdminLog.
 */
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
      // 1. Mark completed
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

      // 2. Release locked balance (funds left the system)
      const wallet = await tx.wallet.update({
        where: { userId: withdrawal.userId },
        data:  { lockedWithdrawalBalance: { decrement: withdrawal.amount } },
        select: { id: true },
      });

      // 3. WalletTransaction record
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

      // 4. AdminLog
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

  return { withdrawalId, status: "COMPLETED", completedAt, txHash: input.txHash };
}

// ── Reject (PENDING | APPROVED → REJECTED) ───────────────────────────────────

/**
 * Rejects a withdrawal and automatically refunds the locked amount back to
 * the user's withdrawalWallet.
 *
 * Atomically:
 *   1. Sets status REJECTED with reason.
 *   2. Releases lockedWithdrawalBalance.
 *   3. Refunds withdrawalWallet.
 *   4. Creates a WalletTransaction (refund).
 *   5. Creates an AdminLog.
 */
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
    // 1. Mark rejected
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data:  {
        status:         "REJECTED",
        rejectedReason: input.rejectedReason,
        ...(input.adminNotes !== undefined && { adminNotes: input.adminNotes }),
      },
    });

    // 2. Refund wallet
    const wallet = await tx.wallet.update({
      where: { userId: withdrawal.userId },
      data:  {
        lockedWithdrawalBalance: { decrement: withdrawal.amount },
        withdrawalWallet:        { increment: withdrawal.amount },
      },
      select: { id: true },
    });

    // 3. WalletTransaction (refund record)
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

    // 4. AdminLog
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

  return { withdrawalId, status: "REJECTED" };
}
