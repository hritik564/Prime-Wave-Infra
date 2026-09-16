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
  ReconcileWithdrawalInput,
  UpdateWithdrawalNotesInput,
} from "../withdrawals/withdrawals.schema";
import { notificationService } from "../notifications/notifications.service";
import { getBscConfig } from "../deposit-verification/adapter/bsc/bsc-config";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { getWithdrawalRequiredConfirmations } from "../withdrawals/withdrawal-config";
import { logWithdrawalEvent } from "../withdrawals/withdrawal-events.service";

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

  const processingStatuses = ["VALIDATING", "QUEUED", "PROCESSING", "SIGNED", "BROADCASTING"] as const;
  const where: Prisma.WithdrawalRequestWhereInput = {
    ...(status
      ? { status: status === "PROCESSING" ? { in: [...processingStatuses] } : status }
      : {}),
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

  const [adminLogs, events] = await Promise.all([
    prisma.adminLog.findMany({
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
    }),
    prisma.withdrawalEvent.findMany({
      where: { withdrawalId },
      orderBy: { createdAt: "asc" },
      select: { id: true, eventType: true, details: true, createdAt: true },
    }),
  ]);

  const withdrawalLogs = adminLogs.filter((log) => {
    const det = log.details as Record<string, unknown> | null;
    return det && det["withdrawalId"] === withdrawalId;
  });

  return { ...withdrawal, adminLogs: withdrawalLogs, events };
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

// ── Reconcile (APPROVED → MANUAL_REVIEW, no financial operation) ─────────────

export async function reconcileApprovedWithdrawal(
  adminId:      string,
  withdrawalId: string,
  input:        ReconcileWithdrawalInput,
) {
  const reconciledAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
      select: {
        id: true,
        userId: true,
        amount: true,
        network: true,
        status: true,
        walletAddress: true,
      },
    });

    if (!withdrawal) {
      throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
    }

    if (withdrawal.status === "MANUAL_REVIEW") {
      return {
        withdrawalId,
        status: "MANUAL_REVIEW" as const,
        alreadyReconciled: true,
      };
    }

    if (withdrawal.status !== "APPROVED") {
      throw new AppError(
        `Only APPROVED withdrawals can be moved to MANUAL_REVIEW; current status is ${withdrawal.status}`,
        HTTP_STATUS.CONFLICT,
        "WITHDRAWAL_NOT_APPROVED",
      );
    }

    const changed = await tx.withdrawalRequest.updateMany({
      where: {
        id: withdrawalId,
        status: "APPROVED",
      },
      data: {
        status: "MANUAL_REVIEW",
      },
    });

    if (changed.count !== 1) {
      throw new AppError(
        "Withdrawal changed state before reconciliation could be completed",
        HTTP_STATUS.CONFLICT,
        "WITHDRAWAL_STATE_CHANGED",
      );
    }

    const auditDetails = {
      withdrawalId,
      amount: withdrawal.amount.toString(),
      network: withdrawal.network,
      walletAddress: withdrawal.walletAddress,
      previousState: "APPROVED",
      newState: "MANUAL_REVIEW",
      reconciliationReason: input.reason,
      financialOperation: "NONE",
      reconciledAt: reconciledAt.toISOString(),
    };

    await tx.adminLog.create({
      data: {
        adminId,
        action: "WITHDRAWAL_MOVED_TO_MANUAL_REVIEW",
        targetUserId: withdrawal.userId,
        details: auditDetails,
      },
    });

    await tx.withdrawalEvent.create({
      data: {
        withdrawalId,
        eventType: "MANUAL_REVIEW",
        details: {
          ...auditDetails,
          administrativeActor: adminId,
        },
        createdAt: reconciledAt,
      },
    });

    return {
      withdrawalId,
      status: "MANUAL_REVIEW" as const,
      alreadyReconciled: false,
    };
  });

  return result;
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
  if (withdrawal.status !== "PENDING" && withdrawal.status !== "UNDER_REVIEW") {
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
        status:        "APPROVED",
        failureReason: null,
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

async function verifyManualCompletionEvidence(
  withdrawal: {
    amount: Prisma.Decimal;
    network: "BEP20";
    walletAddress: string;
    preparedTxData: unknown;
  },
  txHash: string,
): Promise<void> {
  if (!isGatewayConfigured(withdrawal.network)) {
    throw new AppError(
      "Blockchain gateway is not configured; on-chain completion cannot be verified",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "BLOCKCHAIN_GATEWAY_NOT_CONFIGURED",
    );
  }

  const gateway = getWithdrawalGateway(withdrawal.network);
  const chainTx = await gateway.getTransaction(txHash);
  if (!chainTx) {
    throw new AppError(
      "Transaction was not found on the configured blockchain",
      HTTP_STATUS.CONFLICT,
      "TRANSACTION_NOT_FOUND",
    );
  }
  if (chainTx.status !== "success") {
    throw new AppError(
      "Transaction is not successfully mined",
      HTTP_STATUS.CONFLICT,
      "TRANSACTION_NOT_CONFIRMED",
    );
  }

  const requiredConfirmations = getWithdrawalRequiredConfirmations();
  if (chainTx.confirmations < requiredConfirmations) {
    throw new AppError(
      `Transaction has ${chainTx.confirmations} confirmations; ${requiredConfirmations} are required`,
      HTTP_STATUS.CONFLICT,
      "INSUFFICIENT_CONFIRMATIONS",
    );
  }

  const health = await gateway.getHealth();
  const prepared = withdrawal.preparedTxData as { tokenContract?: string } | null;
  const verification = gateway.verifyTransfer(chainTx, {
    tokenContract: prepared?.tokenContract ?? getBscConfig().usdtContractAddress,
    sender: health.hotWalletAddress ?? "",
    recipient: withdrawal.walletAddress,
    amount: withdrawal.amount.toString(),
  });
  if (!verification.valid) {
    throw new AppError(
      verification.reason ?? "Transaction does not match the intended USDT transfer",
      HTTP_STATUS.CONFLICT,
      "TRANSACTION_MISMATCH",
    );
  }
}

export async function completeWithdrawal(
  adminId:      string,
  withdrawalId: string,
  input:        CompleteWithdrawalInput,
) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: {
      id: true,
      userId: true,
      amount: true,
      status: true,
      network: true,
      walletAddress: true,
      preparedTxData: true,
    },
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

  await verifyManualCompletionEvidence(withdrawal, input.txHash);
  const completedAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalId, status: "APPROVED", txHash: null },
        data:  {
          status:             "COMPLETED",
          completedByAdminId: adminId,
          completedAt,
          txHash:             input.txHash,
          ...(input.adminNotes !== undefined && { adminNotes: input.adminNotes }),
        },
      });
      if (changed.count !== 1) {
        throw new AppError(
          "Withdrawal is no longer APPROVED or has already been settled",
          HTTP_STATUS.CONFLICT,
          "WITHDRAWAL_ALREADY_SETTLED",
        );
      }

      const walletChanged = await tx.wallet.updateMany({
        where: {
          userId: withdrawal.userId,
          lockedWithdrawalBalance: { gte: withdrawal.amount },
        },
        data: { lockedWithdrawalBalance: { decrement: withdrawal.amount } },
      });
      if (walletChanged.count !== 1) {
        throw new AppError(
          "Withdrawal completion could not release the locked balance safely",
          HTTP_STATUS.CONFLICT,
          "LOCKED_BALANCE_MISMATCH",
        );
      }
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: withdrawal.userId },
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
          withdrawalRequestId: withdrawalId,
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

  await logWithdrawalEvent(withdrawalId, "COMPLETED", {
    txHash: input.txHash,
    completedBy: adminId,
    source: "manual-admin",
  });

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
  const REJECTABLE = ["PENDING", "APPROVED", "UNDER_REVIEW", "MANUAL_REVIEW"] as const;
  if (!REJECTABLE.includes(withdrawal.status as typeof REJECTABLE[number])) {
    throw new AppError(
      "Only PENDING, UNDER_REVIEW, MANUAL_REVIEW, or APPROVED withdrawals can be rejected",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_REJECTABLE",
    );
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.withdrawalRequest.updateMany({
      where: {
        id: withdrawalId,
        status: { in: [...REJECTABLE] },
      },
      data:  {
        status:         "REJECTED",
        rejectedReason: input.rejectedReason,
        ...(input.adminNotes !== undefined && { adminNotes: input.adminNotes }),
      },
    });
    if (changed.count !== 1) {
      throw new AppError(
        "Withdrawal is no longer in a rejectable state",
        HTTP_STATUS.CONFLICT,
        "WITHDRAWAL_ALREADY_SETTLED",
      );
    }

    const walletChanged = await tx.wallet.updateMany({
      where: {
        userId: withdrawal.userId,
        lockedWithdrawalBalance: { gte: withdrawal.amount },
      },
      data:  {
        lockedWithdrawalBalance: { decrement: withdrawal.amount },
        withdrawalWallet:        { increment: withdrawal.amount },
      },
    });
    if (walletChanged.count !== 1) {
      throw new AppError(
        "Withdrawal rejection could not release the locked balance safely",
        HTTP_STATUS.CONFLICT,
        "LOCKED_BALANCE_MISMATCH",
      );
    }
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId: withdrawal.userId },
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
        withdrawalRequestId: withdrawalId,
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

  await logWithdrawalEvent(withdrawalId, "REJECTED", {
    reason: input.rejectedReason,
    rejectedBy: adminId,
    source: "manual-admin",
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

// ── Reprocess (explicit admin retry → APPROVED) ───────────────────────────────
//
// An explicit retry grants the same queue entry point as approval. The worker
// claims APPROVED requests and atomically moves them to QUEUED.

export async function reprocessWithdrawal(adminId: string, withdrawalId: string) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: { id: true, userId: true, amount: true, status: true, network: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }

  const REPROCESSABLE = ["PENDING", "APPROVED", "UNDER_REVIEW", "MANUAL_REVIEW"] as const;
  if (!REPROCESSABLE.includes(withdrawal.status as typeof REPROCESSABLE[number])) {
    throw new AppError(
      "Only PENDING, APPROVED, UNDER_REVIEW, or MANUAL_REVIEW withdrawals can be reprocessed",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_REPROCESSABLE",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      // Clear requestedAt to bypass the hold-period filter immediately.
      data: {
        status: "APPROVED",
        failureReason: null,
        approvedByAdminId: adminId,
        approvedAt: new Date(),
        requestedAt: new Date(Date.now() - 60 * 60 * 1_000),
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "WITHDRAWAL_REPROCESSED",
        targetUserId: withdrawal.userId,
        details: {
          withdrawalId,
          previousStatus: withdrawal.status,
          amount:         withdrawal.amount.toString(),
          network:        withdrawal.network,
        },
      },
    });
  });

  return { withdrawalId, status: "APPROVED" };
}

// ── Release Hold (UNDER_REVIEW → PENDING) ────────────────────────────────────

export async function releaseHoldWithdrawal(adminId: string, withdrawalId: string) {
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where:  { id: withdrawalId },
    select: { id: true, userId: true, amount: true, status: true, network: true, walletAddress: true, withdrawalId: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }
  if (withdrawal.status !== "UNDER_REVIEW") {
    throw new AppError(
      "Only UNDER_REVIEW withdrawals can be released to the queue",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_UNDER_REVIEW",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data:  { status: "PENDING" },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "WITHDRAWAL_HOLD_RELEASED",
        targetUserId: withdrawal.userId,
        details: {
          withdrawalId,
          amount:  withdrawal.amount.toString(),
          network: withdrawal.network,
        },
      },
    });
  });

  return { withdrawalId, status: "PENDING" };
}
