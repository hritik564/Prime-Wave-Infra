import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { CreateWithdrawalInput, WithdrawalHistoryQuery } from "./withdrawals.schema";
import { logger } from "../lib/logger";
import { writeLedgerEntry } from "../ledger/ledger.service";

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
  const settings    = await getWithdrawalSettings(network);
  const holdMinutes = parseInt(process.env["WITHDRAWAL_HOLD_MINUTES"] ?? "2", 10);
  return {
    network:       settings.network,
    minimumAmount: settings.minimumAmount.toFixed(2),
    maximumAmount: settings.maximumAmount.toFixed(2),
    isEnabled:     settings.isEnabled,
    holdMinutes,
  };
}

/**
 * Admin-only update to withdrawal settings for a network.
 * Partial update — only provided fields are changed.
 */
export async function updateWithdrawalSettings(
  network: "BEP20",
  input:   { minimumAmount?: number; maximumAmount?: number; isEnabled?: boolean },
) {
  const current = await getWithdrawalSettings(network);

  const nextMin = input.minimumAmount !== undefined ? new Prisma.Decimal(input.minimumAmount) : current.minimumAmount;
  const nextMax = input.maximumAmount !== undefined ? new Prisma.Decimal(input.maximumAmount) : current.maximumAmount;

  if (nextMin.gt(nextMax)) {
    throw new AppError(
      "Minimum amount must not exceed maximum amount",
      HTTP_STATUS.BAD_REQUEST,
      "INVALID_WITHDRAWAL_SETTINGS",
    );
  }

  const updated = await prisma.withdrawalSettings.update({
    where: { network },
    data: {
      ...(input.minimumAmount !== undefined ? { minimumAmount: nextMin } : {}),
      ...(input.maximumAmount !== undefined ? { maximumAmount: nextMax } : {}),
      ...(input.isEnabled     !== undefined ? { isEnabled: input.isEnabled } : {}),
    },
  });

  return {
    network:       updated.network,
    minimumAmount: updated.minimumAmount.toFixed(2),
    maximumAmount: updated.maximumAmount.toFixed(2),
    isEnabled:     updated.isEnabled,
  };
}

// ── Create withdrawal request ─────────────────────────────────────────────────

/**
 * Submits a withdrawal request for the authenticated user.
 *
 * Rules:
 *   1. Withdrawals must be enabled for the requested network.
 *   2. Amount must be within [minimumAmount, maximumAmount].
 *   3. Only one active (pre-terminal) withdrawal is allowed at a time.
 *   4. User must have a verified wallet address for the network.
 *   5. User must have sufficient available withdrawalWallet balance.
 *
 * On success (single Prisma transaction):
 *   - WithdrawalRequest created (PENDING) with fee, netAmount, withdrawalId.
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

  // ── Verify wallet address is registered and verified ──────────────────────
  const verifiedAddress = await prisma.walletAddress.findFirst({
    where: { userId, network: input.network, address: input.walletAddress, isVerified: true },
  });
  if (!verifiedAddress) {
    throw new AppError(
      "The provided wallet address is not registered on your account. Add it as a verified address first.",
      HTTP_STATUS.BAD_REQUEST,
      "WALLET_ADDRESS_NOT_VERIFIED",
    );
  }

  // ── Only one active withdrawal per user ───────────────────────────────────
  const ACTIVE_STATUSES = ["PENDING", "VALIDATING", "QUEUED", "PROCESSING", "BROADCASTING", "CONFIRMING", "UNDER_REVIEW"] as const;
  const existing = await prisma.withdrawalRequest.findFirst({
    where:  { userId, status: { in: [...ACTIVE_STATUSES] } },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new AppError(
      "You already have an active withdrawal request. Cancel it or wait for it to complete.",
      HTTP_STATUS.CONFLICT,
      "WITHDRAWAL_ALREADY_ACTIVE",
    );
  }

  // ── Check withdrawal hold ─────────────────────────────────────────────────
  const userRecord = await prisma.user.findUnique({
    where:  { id: userId },
    select: { withdrawalHold: true },
  });
  const isOnHold = userRecord?.withdrawalHold ?? false;

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

  // ── Compute fee & net amount ──────────────────────────────────────────────
  const feePercent = settings.feePercentage;
  const fee        = decimalAmount.mul(feePercent).div(100).toDecimalPlaces(8);
  const netAmount  = decimalAmount.minus(fee);

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

    // 2. Create request (UNDER_REVIEW if user is on hold, else PENDING)
    const created = await tx.withdrawalRequest.create({
      data: {
        userId,
        amount:                decimalAmount,
        fee,
        netAmount,
        walletAddress:         input.walletAddress,
        walletAddressSnapshot: input.walletAddress,
        network:               input.network,
        currency:              "USDT",
        status:                isOnHold ? "UNDER_REVIEW" : "PENDING",
      },
      select: { ...withdrawalSelect, seqId: true },
    });

    // 3. Generate human-readable withdrawalId from auto-increment seqId
    const withdrawalId = `PW-WD-${String(created.seqId).padStart(6, "0")}`;
    return tx.withdrawalRequest.update({
      where:  { id: created.id },
      data:   { withdrawalId },
      select: withdrawalSelect,
    });
  });

  void prisma.wallet.findUnique({ where: { userId }, select: { withdrawalWallet: true, lockedWithdrawalBalance: true } })
    .then(w => w && writeLedgerEntry({
      referenceId:     request.id,
      referenceType:   "withdrawal_request",
      memberId:        userId,
      username:        userId,
      transactionType: "WITHDRAWAL_REQUEST",
      amount:          decimalAmount,
      debitCredit:     "DEBIT",
      walletType:      "WITHDRAWAL_WALLET",
      closingBalance:  w.withdrawalWallet,
      withdrawalId:    request.withdrawalId ?? request.id,
      metadata:        { fee: fee.toFixed(8), netAmount: netAmount.toFixed(8), network: input.network },
    }))
    .catch(err => logger.error({ err }, "ledger: withdrawal request write failed"));

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

  void prisma.wallet.findUnique({ where: { userId }, select: { withdrawalWallet: true } })
    .then(w => w && writeLedgerEntry({
      referenceId:     withdrawalId,
      referenceType:   "withdrawal_cancellation",
      memberId:        userId,
      username:        userId,
      transactionType: "WITHDRAWAL_CANCELLATION",
      amount:          withdrawal.amount,
      debitCredit:     "CREDIT",
      walletType:      "WITHDRAWAL_WALLET",
      closingBalance:  w.withdrawalWallet,
      withdrawalId,
    }))
    .catch(err => logger.error({ err }, "ledger: withdrawal cancellation write failed"));

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
  withdrawalId:          true,
  currency:              true,
  amount:                true,
  fee:                   true,
  netAmount:             true,
  walletAddress:         true,
  walletAddressSnapshot: true,
  network:               true,
  status:                true,
  failureReason:         true,
  rejectedReason:        true,
  cancelledAt:           true,
  approvedAt:            true,
  processedAt:           true,
  completedAt:           true,
  txHash:                true,
  requestedAt:           true,
  createdAt:             true,
} as const;

const withdrawalDetailSelect = {
  ...withdrawalSelect,
  approver:  { select: { id: true, firstName: true, lastName: true } },
  completer: { select: { id: true, firstName: true, lastName: true } },
} as const;
