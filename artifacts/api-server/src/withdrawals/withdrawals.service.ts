import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { CreateWithdrawalInput, WithdrawalHistoryQuery } from "./withdrawals.schema";

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * Returns the withdrawal settings for a given network.
 * Throws if no settings row exists (misconfiguration).
 */
export async function getWithdrawalSettings(network: "BEP20") {
  const settings = await prisma.withdrawalSettings.findUnique({ where: { network } });
  if (!settings) {
    throw new AppError(
      `Withdrawal settings not configured for ${network}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "WITHDRAWAL_SETTINGS_MISSING",
    );
  }
  return settings;
}

/**
 * Public-facing withdrawal settings for the authenticated user's client UI.
 * Exposes only what's needed to render min/max validation — no internal fields.
 */
export async function getWithdrawalSettingsPublic(network: "BEP20") {
  const settings = await getWithdrawalSettings(network);
  return {
    network:       settings.network,
    minimumAmount: settings.minimumAmount.toFixed(2),
    maximumAmount: settings.maximumAmount.toFixed(2),
    isEnabled:     settings.isEnabled,
  };
}

// ── Create withdrawal request ─────────────────────────────────────────────────

/**
 * Submits a withdrawal request for the authenticated user.
 *
 * Rules:
 *   1. Withdrawals must be enabled for the requested network.
 *   2. Amount must be within [minimumAmount, maximumAmount].
 *   3. Only one PENDING withdrawal is allowed at a time.
 *   4. User must have sufficient available withdrawalWallet balance.
 *
 * On success (single Prisma transaction):
 *   - WithdrawalRequest created (PENDING).
 *   - withdrawalWallet  decremented by amount.
 *   - lockedWithdrawalBalance incremented by amount.
 */
export async function createWithdrawal(
  userId: string,
  input:  CreateWithdrawalInput,
) {
  const decimalAmount = new Prisma.Decimal(input.amount);

  // ── Load settings ─────────────────────────────────────────────────────────
  const settings = await getWithdrawalSettings(input.network);

  if (!settings.isEnabled) {
    throw new AppError(
      `Withdrawals are currently disabled for ${input.network}`,
      HTTP_STATUS.BAD_REQUEST,
      "WITHDRAWALS_DISABLED",
    );
  }

  if (decimalAmount.lt(settings.minimumAmount)) {
    throw new AppError(
      `Minimum withdrawal is $${settings.minimumAmount.toFixed(2)}`,
      HTTP_STATUS.BAD_REQUEST,
      "BELOW_MINIMUM_WITHDRAWAL",
    );
  }

  if (decimalAmount.gt(settings.maximumAmount)) {
    throw new AppError(
      `Maximum withdrawal is $${settings.maximumAmount.toFixed(2)}`,
      HTTP_STATUS.BAD_REQUEST,
      "ABOVE_MAXIMUM_WITHDRAWAL",
    );
  }

  // ── Only one pending withdrawal per user ──────────────────────────────────
  const existing = await prisma.withdrawalRequest.findFirst({
    where: { userId, status: "PENDING" },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(
      "You already have a pending withdrawal request. Cancel it before submitting a new one.",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_ALREADY_PENDING",
    );
  }

  // ── Load wallet and check balance ─────────────────────────────────────────
  const wallet = await prisma.wallet.findUnique({
    where:  { userId },
    select: { id: true, withdrawalWallet: true },
  });
  if (!wallet) {
    throw new AppError("Wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }
  if (wallet.withdrawalWallet.lt(decimalAmount)) {
    throw new AppError(
      `Insufficient withdrawal balance. Available: $${wallet.withdrawalWallet.toFixed(2)}`,
      HTTP_STATUS.BAD_REQUEST,
      "INSUFFICIENT_BALANCE",
    );
  }

  // ── Atomic: lock funds + create request ───────────────────────────────────
  const request = await prisma.$transaction(async (tx) => {
    // 1. Lock funds
    await tx.wallet.update({
      where: { id: wallet.id },
      data:  {
        withdrawalWallet:        { decrement: decimalAmount },
        lockedWithdrawalBalance: { increment: decimalAmount },
      },
    });

    // 2. Create request — snapshot the wallet address at submission time so
    //    future profile edits cannot change where this payout is sent.
    return tx.withdrawalRequest.create({
      data: {
        userId,
        amount:                 decimalAmount,
        walletAddress:          input.walletAddress,
        walletAddressSnapshot:  input.walletAddress,
        network:                input.network,
        status:                 "PENDING",
      },
      select: withdrawalSelect,
    });
  });

  return request;
}

// ── Cancel withdrawal (user-initiated) ───────────────────────────────────────

/**
 * Allows a user to cancel their own PENDING withdrawal.
 * Atomically:
 *   1. Sets status to CANCELLED.
 *   2. Refunds withdrawalWallet.
 *   3. Releases lockedWithdrawalBalance.
 */
export async function cancelWithdrawal(userId: string, withdrawalId: string) {
  const withdrawal = await prisma.withdrawalRequest.findFirst({
    where:  { id: withdrawalId, userId },
    select: { id: true, userId: true, amount: true, status: true },
  });

  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }
  if (withdrawal.status !== "PENDING") {
    throw new AppError(
      "Only PENDING withdrawals can be cancelled",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_NOT_CANCELLABLE",
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // 1. Mark cancelled
    await tx.withdrawalRequest.update({
      where: { id: withdrawalId },
      data:  { status: "CANCELLED", cancelledAt: now },
    });

    // 2. Refund
    await tx.wallet.update({
      where: { userId },
      data:  {
        withdrawalWallet:        { increment: withdrawal.amount },
        lockedWithdrawalBalance: { decrement: withdrawal.amount },
      },
    });
  });

  return { withdrawalId, status: "CANCELLED", cancelledAt: now };
}

// ── Withdrawal history ────────────────────────────────────────────────────────

export async function getWithdrawalHistory(
  userId: string,
  query:  WithdrawalHistoryQuery,
) {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.WithdrawalRequestWhereInput = {
    userId,
    ...(status && { status }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  withdrawalSelect,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Single withdrawal ─────────────────────────────────────────────────────────

export async function getWithdrawalById(userId: string, withdrawalId: string) {
  const withdrawal = await prisma.withdrawalRequest.findFirst({
    where:  { id: withdrawalId, userId },
    select: withdrawalDetailSelect,
  });
  if (!withdrawal) {
    throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "WITHDRAWAL_NOT_FOUND");
  }
  return withdrawal;
}

// ── Selects ───────────────────────────────────────────────────────────────────

const withdrawalSelect = {
  id:                    true,
  amount:                true,
  walletAddress:         true,
  walletAddressSnapshot: true,
  network:               true,
  status:                true,
  rejectedReason:        true,
  cancelledAt:           true,
  approvedAt:            true,
  completedAt:           true,
  txHash:                true,
  createdAt:             true,
} as const;

const withdrawalDetailSelect = {
  ...withdrawalSelect,
  approver:  { select: { id: true, firstName: true, lastName: true } },
  completer: { select: { id: true, firstName: true, lastName: true } },
} as const;
