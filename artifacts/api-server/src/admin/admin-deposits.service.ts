import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminDepositListQuery, RejectDepositInput } from "../deposits/deposits.schema";
import { notificationService } from "../notifications/notifications.service";

// ── Shared select ─────────────────────────────────────────────────────────────

const depositListSelect = {
  id:             true,
  amount:         true,
  network:        true,
  txHash:         true,
  screenshotUrl:  true,
  companyWallet:  true,
  status:         true,
  approvedAt:     true,
  rejectedReason: true,
  createdAt:      true,
  user: {
    select: { id: true, username: true, email: true, firstName: true, lastName: true },
  },
  approver: {
    select: { id: true, email: true, firstName: true, lastName: true },
  },
} as const;

// ── Full deposit list (all statuses) ─────────────────────────────────────────

export async function getAdminDeposits(query: AdminDepositListQuery) {
  const { page, limit, status, network, search, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.DepositRequestWhereInput = {
    ...(status  && { status }),
    ...(network && { network }),
    ...(search  && {
      OR: [
        { user: { username: { contains: search, mode: "insensitive" } } },
        { id:          { contains: search, mode: "insensitive" } },
        { txHash:      { contains: search, mode: "insensitive" } },
        { companyWallet: { contains: search, mode: "insensitive" } },
      ],
    }),
  };

  const orderBy: Prisma.DepositRequestOrderByWithRelationInput =
    sortBy === "amount"
      ? { amount: sortOrder }
      : { createdAt: sortOrder };

  const [records, total] = await prisma.$transaction([
    prisma.depositRequest.findMany({ where, orderBy, skip, take: limit, select: depositListSelect }),
    prisma.depositRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Single deposit detail ─────────────────────────────────────────────────────

export async function getDepositById(depositId: string) {
  const deposit = await prisma.depositRequest.findUnique({
    where:  { id: depositId },
    select: {
      ...depositListSelect,
      user: {
        select: {
          id:           true,
          username:     true,
          email:        true,
          firstName:    true,
          lastName:     true,
          status:       true,
          referralCode: true,
          wallet: {
            select: {
              depositWallet:    true,
              incomeWallet:     true,
              withdrawalWallet: true,
            },
          },
        },
      },
    },
  });

  if (!deposit) {
    throw new AppError("Deposit not found", HTTP_STATUS.NOT_FOUND, "DEPOSIT_NOT_FOUND");
  }

  return deposit;
}

// ── Pending deposits (legacy queue view) ──────────────────────────────────────

export async function getPendingDeposits(query: AdminDepositListQuery) {
  return getAdminDeposits({ ...query, status: "PENDING" });
}

// ── Enhanced stats ────────────────────────────────────────────────────────────

export async function getDepositStats() {
  const now          = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday   = new Date(startOfToday.getTime() + 86_400_000);

  const [
    pendingCount,
    confirmingCount,
    approvedToday,
    rejectedToday,
    totalAgg,
    avgAgg,
    largestAgg,
    pendingValueAgg,
  ] = await prisma.$transaction([
    prisma.depositRequest.count({ where: { status: "PENDING" } }),
    prisma.depositRequest.count({ where: { status: "CONFIRMING" } }),
    prisma.depositRequest.count({ where: { status: "APPROVED", approvedAt: { gte: startOfToday, lt: endOfToday } } }),
    prisma.depositRequest.count({ where: { status: "REJECTED", createdAt:  { gte: startOfToday, lt: endOfToday } } }),
    prisma.depositRequest.aggregate({ where: { status: "APPROVED" }, _sum: { amount: true } }),
    prisma.depositRequest.aggregate({ where: { status: "APPROVED" }, _avg: { amount: true } }),
    prisma.depositRequest.aggregate({ where: { status: "APPROVED" }, _max: { amount: true } }),
    prisma.depositRequest.aggregate({ where: { status: { in: ["PENDING", "CONFIRMING"] } }, _sum: { amount: true } }),
  ]);

  return {
    pendingCount,
    confirmingCount,
    approvedToday,
    rejectedToday,
    totalApprovedAmount: (totalAgg._sum.amount   ?? new Prisma.Decimal(0)).toString(),
    avgDepositAmount:    (avgAgg._avg.amount      ?? new Prisma.Decimal(0)).toString(),
    largestDeposit:      (largestAgg._max.amount  ?? new Prisma.Decimal(0)).toString(),
    pendingDepositValue: (pendingValueAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
  };
}

// ── Mark Confirming ───────────────────────────────────────────────────────────

export async function markDepositConfirming(adminId: string, depositId: string) {
  const deposit = await prisma.depositRequest.findUnique({
    where:  { id: depositId },
    select: { id: true, userId: true, status: true, amount: true, network: true, txHash: true },
  });

  if (!deposit) {
    throw new AppError("Deposit not found", HTTP_STATUS.NOT_FOUND, "DEPOSIT_NOT_FOUND");
  }
  if (deposit.status !== "PENDING") {
    throw new AppError(
      "Only PENDING deposits can be marked as confirming",
      HTTP_STATUS.CONFLICT,
      "DEPOSIT_NOT_PENDING",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.depositRequest.update({
      where: { id: depositId },
      data:  { status: "CONFIRMING" },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "DEPOSIT_CONFIRMING",
        targetUserId: deposit.userId,
        details: {
          depositId,
          amount:  deposit.amount.toString(),
          network: deposit.network,
          txHash:  deposit.txHash,
        },
      },
    });
  }, { timeout: 30_000 });

  return { depositId, status: "CONFIRMING" };
}

// ── Approve ───────────────────────────────────────────────────────────────────

export async function approveDeposit(adminId: string, depositId: string) {
  const deposit = await prisma.depositRequest.findUnique({
    where:  { id: depositId },
    select: { id: true, userId: true, amount: true, status: true, txHash: true, network: true },
  });

  if (!deposit) {
    throw new AppError("Deposit not found", HTTP_STATUS.NOT_FOUND, "DEPOSIT_NOT_FOUND");
  }
  if (deposit.status !== "PENDING" && deposit.status !== "CONFIRMING") {
    throw new AppError(
      `Deposit is already ${deposit.status.toLowerCase()}`,
      HTTP_STATUS.CONFLICT,
      "DEPOSIT_NOT_APPROVABLE",
    );
  }

  const approvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.depositRequest.update({
      where: { id: depositId },
      data:  { status: "APPROVED", approvedByAdminId: adminId, approvedAt },
    });

    const wallet = await tx.wallet.update({
      where:  { userId: deposit.userId },
      data:   { depositWallet: { increment: deposit.amount } },
      select: { id: true },
    });

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
  }, { timeout: 30_000 });

  void notificationService.create({
    userId:   deposit.userId,
    type:     "DEPOSIT_APPROVED",
    title:    "Deposit Approved",
    message:  `Your deposit of $${deposit.amount.toFixed(2)} (${deposit.network}) has been approved and credited to your account.`,
    metadata: { depositId, amount: deposit.amount.toString(), network: deposit.network },
  });

  return { depositId, status: "APPROVED", approvedAt };
}

// ── Reject ────────────────────────────────────────────────────────────────────

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
  if (deposit.status !== "PENDING" && deposit.status !== "CONFIRMING") {
    throw new AppError(
      `Deposit is already ${deposit.status.toLowerCase()}`,
      HTTP_STATUS.CONFLICT,
      "DEPOSIT_NOT_REJECTABLE",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.depositRequest.update({
      where: { id: depositId },
      data:  { status: "REJECTED", rejectedReason: input.rejectedReason },
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
    userId:   deposit.userId,
    type:     "DEPOSIT_REJECTED",
    title:    "Deposit Rejected",
    message:  `Your deposit of $${deposit.amount.toFixed(2)} (${deposit.network}) was rejected. Reason: ${input.rejectedReason}`,
    metadata: { depositId, amount: deposit.amount.toString(), network: deposit.network, reason: input.rejectedReason },
  });

  return { depositId, status: "REJECTED" };
}

// ── Manual Admin Deposit ──────────────────────────────────────────────────────
//
// Directly credits a user's deposit wallet by an authorised administrator.
// No blockchain transaction involved — funds are credited immediately.
//
// Design principles:
//   • The deposit wallet accepts any positive USDT amount (amount > 0 only).
//   • All investment business rules remain exclusively inside the Investment Engine.
//   • approvalMode = MANUAL_ADMIN distinguishes this from blockchain deposits.
//   • A synthetic txHash (MANUAL-<uuid>) satisfies the @unique DB constraint
//     without requiring a schema migration.
//   • Reason and Notes are stored immutably in AdminLog.details JSON.

import { randomUUID } from "crypto";
import type { ManualAdminDepositInput, WalletCreditInput } from "../deposits/deposits.schema";

export async function createManualAdminDeposit(
  adminId: string,
  input:   ManualAdminDepositInput,
  ip?:     string,
) {
  const { userId, amount, network, reason, notes } = input;

  // Verify target user exists
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new AppError("Target user not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  // Synthetic txHash — satisfies @unique constraint; MANUAL- prefix makes
  // the origin unambiguous in every query, log, and UI that shows txHash.
  const syntheticTxHash = `MANUAL-${randomUUID().replace(/-/g, "")}`;
  const decimalAmount   = new Prisma.Decimal(amount.toString());
  const now             = new Date();

  let depositId: string;

  await prisma.$transaction(async (tx) => {
    // Create DepositRequest — immediately APPROVED; no pending state for manual deposits
    const deposit = await tx.depositRequest.create({
      data: {
        userId,
        amount:           decimalAmount,
        network,
        txHash:           syntheticTxHash,
        companyWallet:    "MANUAL_ADMIN",
        status:           "APPROVED",
        approvedByAdminId: adminId,
        approvedAt:       now,
      },
      select: { id: true },
    });
    depositId = deposit.id;

    // Credit deposit wallet
    const wallet = await tx.wallet.update({
      where:  { userId },
      data:   { depositWallet: { increment: decimalAmount } },
      select: { id: true },
    });

    // Wallet history — clearly labelled as manual; avoids any blockchain wording
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId,
        type:        "DEPOSIT",
        status:      "SUCCESS",
        amount:      decimalAmount,
        description: "Manual Deposit — Credited by Administrator",
        metadata:    {
          depositId:    deposit.id,
          approvalMode: "MANUAL_ADMIN",
          reason,
          ...(notes !== undefined && { notes }),
          network,
          adminId,
        },
      },
    });

    // Immutable audit log
    await tx.adminLog.create({
      data: {
        adminId,
        action:       "MANUAL_DEPOSIT",
        targetUserId: userId,
        details: {
          depositId:    deposit.id,
          amount:       decimalAmount.toFixed(2),
          network,
          approvalMode: "MANUAL_ADMIN",
          reason,
          ...(notes !== undefined && { notes }),
          syntheticTxHash,
          ...(ip !== undefined && { ipAddress: ip }),
          creditedAt:   now.toISOString(),
        },
      },
    });
  }, { timeout: 30_000 });

  // Notify user — outside the transaction so a notification failure never
  // rolls back the already-credited wallet
  void notificationService.create({
    userId,
    type:    "DEPOSIT_APPROVED",
    title:   "Manual Deposit Received",
    message: `An administrator has credited your Deposit Wallet with ${decimalAmount.toFixed(2)} USDT. Reason: ${reason}`,
    metadata: {
      approvalMode: "MANUAL_ADMIN",
      depositId:    depositId!,
      amount:       decimalAmount.toFixed(2),
      network,
      reason,
    },
  });

  return {
    depositId:    depositId!,
    userId,
    username:     user.username,
    amount:       decimalAmount.toFixed(2),
    network,
    reason,
    approvalMode: "MANUAL_ADMIN" as const,
    creditedAt:   now,
  };
}

// ── Admin Wallet Credit ───────────────────────────────────────────────────────
//
// Credits any of the three user wallets (deposit / income / withdrawal).
// For depositWallet: delegates to createManualAdminDeposit which creates a
//   DepositRequest record for full audit and blockchain-style history.
// For incomeWallet / withdrawalWallet: direct wallet increment + wallet
//   transaction + audit log + user notification; no DepositRequest created.

export async function creditUserWallet(
  adminId: string,
  input:   WalletCreditInput,
  ip?:     string,
) {
  const { userId, walletType, amount, reason, notes } = input;

  if (walletType === "depositWallet") {
    const result = await createManualAdminDeposit(adminId, {
      userId, amount, network: "BEP20", reason, notes,
    }, ip);
    return {
      userId:      result.userId,
      username:    result.username,
      walletType:  "depositWallet" as const,
      amount:      result.amount,
      reason:      result.reason,
      creditedAt:  result.creditedAt,
    };
  }

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new AppError("Target user not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const decimalAmount = new Prisma.Decimal(amount.toString());
  const now           = new Date();
  const walletLabel   = walletType === "incomeWallet" ? "Income" : "Withdrawal";

  await prisma.$transaction(async (tx) => {
    const walletData = walletType === "incomeWallet"
      ? { incomeWallet:     { increment: decimalAmount } }
      : { withdrawalWallet: { increment: decimalAmount } };

    const wallet = await tx.wallet.update({
      where:  { userId },
      data:   walletData,
      select: { id: true },
    });

    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId,
        type:        "INCOME_TRANSFER",
        status:      "SUCCESS",
        amount:      decimalAmount,
        description: `Admin Credit — ${walletLabel} Wallet`,
        metadata:    {
          approvalMode: "MANUAL_ADMIN",
          walletType,
          reason,
          ...(notes !== undefined && { notes }),
          adminId,
        },
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "MANUAL_WALLET_CREDIT",
        targetUserId: userId,
        details: {
          walletType,
          amount:     decimalAmount.toFixed(2),
          reason,
          ...(notes !== undefined && { notes }),
          ...(ip    !== undefined && { ipAddress: ip }),
          creditedAt: now.toISOString(),
        },
      },
    });
  }, { timeout: 30_000 });

  void notificationService.create({
    userId,
    type:    "DEPOSIT_APPROVED",
    title:   `${walletLabel} Wallet Credited`,
    message: `An administrator has credited your ${walletLabel} Wallet with ${decimalAmount.toFixed(2)} USDT. Reason: ${reason}`,
    metadata: {
      approvalMode: "MANUAL_ADMIN",
      walletType,
      amount:  decimalAmount.toFixed(2),
      reason,
    },
  });

  return {
    userId,
    username:   user.username,
    walletType,
    amount:     decimalAmount.toFixed(2),
    reason,
    creditedAt: now,
  };
}
