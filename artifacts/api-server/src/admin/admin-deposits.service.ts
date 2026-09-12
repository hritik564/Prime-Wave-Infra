import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminDepositListQuery, RejectDepositInput } from "../deposits/deposits.schema";
import { notificationService } from "../notifications/notifications.service";
import { logger } from "../lib/logger";
import { writeLedgerEntry } from "../ledger/ledger.service";

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
//
// IDEMPOTENCY GUARANTEE (Sprint 27F):
//
// The entire approve + credit sequence is wrapped in a single Prisma transaction.
// The first statement inside that transaction is an atomic conditional UPDATE:
//
//   UPDATE deposit_requests
//   SET status='APPROVED', approvedByAdminId=?, approvedAt=?
//   WHERE id=? AND status IN ('PENDING','CONFIRMING')
//
// PostgreSQL's row-level locking serialises concurrent callers:
//   • Caller A acquires the row lock → count=1 → proceeds to credit the wallet.
//   • Caller B waits for A to commit, then sees status='APPROVED' → count=0 →
//     throws ALREADY_APPROVED → transaction rolls back (nothing was written).
//
// Consequence: no matter how many concurrent callers race (admin double-click,
// admin + worker simultaneously), exactly ONE wallet credit is ever executed.
//
// The sourceDepositId UNIQUE constraint on wallet_transactions is a second,
// database-level safety net: even if application logic fails, PostgreSQL will
// reject any duplicate insert for the same depositId.

export async function approveDeposit(adminId: string, depositId: string) {
  // Optimistic fast-reject: surface obvious non-approvable states before entering
  // the transaction.  The definitive check is the conditional UPDATE inside.
  const deposit = await prisma.depositRequest.findUnique({
    where:  { id: depositId },
    select: { id: true, userId: true, amount: true, status: true, txHash: true, network: true },
  });

  if (!deposit) {
    throw new AppError("Deposit not found", HTTP_STATUS.NOT_FOUND, "DEPOSIT_NOT_FOUND");
  }
  if (deposit.status !== "PENDING" && deposit.status !== "CONFIRMING") {
    throw new AppError(
      deposit.status === "APPROVED"
        ? "Deposit already approved"
        : `Deposit is already ${deposit.status.toLowerCase()}`,
      HTTP_STATUS.CONFLICT,
      deposit.status === "APPROVED" ? "ALREADY_APPROVED" : "DEPOSIT_NOT_APPROVABLE",
    );
  }

  const approvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    // ── Atomic ownership claim ────────────────────────────────────────────────
    // Only the caller that successfully transitions PENDING/CONFIRMING → APPROVED
    // proceeds to the wallet credit.  All other concurrent callers see count = 0.
    const { count } = await tx.depositRequest.updateMany({
      where: { id: depositId, status: { in: ["PENDING", "CONFIRMING"] } },
      data:  { status: "APPROVED", approvedByAdminId: adminId, approvedAt },
    });

    if (count === 0) {
      // Another concurrent process already claimed this deposit.
      throw new AppError(
        "Deposit already approved",
        HTTP_STATUS.CONFLICT,
        "ALREADY_APPROVED",
      );
    }

    // ── Credit wallet (only one caller ever reaches here) ─────────────────────
    const wallet = await tx.wallet.update({
      where:  { userId: deposit.userId },
      data:   { depositWallet: { increment: deposit.amount } },
      select: { id: true, depositWallet: true },
    });

    // sourceDepositId carries a DB-level UNIQUE constraint — a second insert for
    // the same depositId is rejected by PostgreSQL even if application guards fail.
    await tx.walletTransaction.create({
      data: {
        walletId:        wallet.id,
        userId:          deposit.userId,
        type:            "DEPOSIT",
        status:          "SUCCESS",
        amount:          deposit.amount,
        description:     `Crypto deposit approved — ${deposit.network} (${deposit.txHash.slice(0, 12)}…)`,
        sourceDepositId: depositId,
        metadata:        { depositId, network: deposit.network, txHash: deposit.txHash, approvedBy: adminId },
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

  void prisma.wallet.findUnique({ where: { userId: deposit.userId }, select: { depositWallet: true } })
    .then(w => w && writeLedgerEntry({
      referenceId:     depositId,
      referenceType:   "deposit_approval",
      memberId:        deposit.userId,
      username:        deposit.userId,
      transactionType: "DEPOSIT",
      amount:          deposit.amount,
      debitCredit:     "CREDIT",
      walletType:      "DEPOSIT_WALLET",
      closingBalance:  w.depositWallet,
      blockchainTxHash: deposit.txHash,
      metadata:        { network: deposit.network, adminId, txHash: deposit.txHash },
    }))
    .catch(err => logger.error({ err }, "ledger: approveDeposit write failed"));

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

import { createHash, randomUUID } from "crypto";
import type { ManualAdminDepositInput, WalletCreditInput } from "../deposits/deposits.schema";

const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

type ManualDepositResult = {
  depositId:    string;
  userId:       string;
  username:     string;
  amount:       string;
  network:      ManualAdminDepositInput["network"];
  reason:       string;
  approvalMode: "MANUAL_ADMIN";
  creditedAt:   Date;
};

function normalizeIdempotencyKey(key?: string): string | undefined {
  if (key === undefined) return undefined;
  const normalized = key.trim();
  if (!normalized || normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new AppError(
      "Idempotency-Key must be between 1 and 255 characters",
      HTTP_STATUS.BAD_REQUEST,
      "IDEMPOTENCY_KEY_INVALID",
    );
  }
  return normalized;
}

function manualDepositFingerprint(
  input: ManualAdminDepositInput,
  decimalAmount: Prisma.Decimal,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      operation: "MANUAL_DEPOSIT",
      walletType: "depositWallet",
      userId: input.userId,
      amount: decimalAmount.toFixed(2),
      network: input.network,
      reason: input.reason,
      notes: input.notes ?? null,
    }))
    .digest("hex");
}

function resultFromIdempotencyRecord(record: {
  depositId: string;
  userId: string;
  username: string;
  amount: Prisma.Decimal;
  network: ManualAdminDepositInput["network"];
  reason: string;
  creditedAt: Date;
}): ManualDepositResult {
  return {
    depositId:    record.depositId,
    userId:       record.userId,
    username:     record.username,
    amount:       record.amount.toFixed(2),
    network:      record.network,
    reason:       record.reason,
    approvalMode: "MANUAL_ADMIN",
    creditedAt:   record.creditedAt,
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function idempotencyKeyReuseError(): AppError {
  return new AppError(
    "Idempotency-Key was already used for a different manual deposit request",
    HTTP_STATUS.CONFLICT,
    "IDEMPOTENCY_KEY_REUSED",
  );
}

export async function createManualAdminDeposit(
  adminId: string,
  input:   ManualAdminDepositInput,
  ip?:     string,
  idempotencyKey?: string,
): Promise<ManualDepositResult> {
  const { userId, amount, network, reason, notes } = input;
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  const decimalAmount = new Prisma.Decimal(amount.toString());
  const requestFingerprint = normalizedIdempotencyKey
    ? manualDepositFingerprint(input, decimalAmount)
    : undefined;

  if (normalizedIdempotencyKey) {
    const existing = await prisma.manualDepositIdempotency.findUnique({
      where: {
        adminId_idempotencyKey: {
          adminId,
          idempotencyKey: normalizedIdempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw idempotencyKeyReuseError();
      }
      return resultFromIdempotencyRecord(existing);
    }
  }

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
  const now             = new Date();

  let result: ManualDepositResult;

  try {
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

      // Credit deposit wallet
      const wallet = await tx.wallet.update({
        where:  { userId },
        data:   { depositWallet: { increment: decimalAmount } },
        select: { id: true, depositWallet: true },
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

      // The unique (adminId, idempotencyKey) row is part of this same
      // transaction. A concurrent duplicate therefore rolls back its entire
      // deposit before its unique-constraint error is handled below.
      if (normalizedIdempotencyKey && requestFingerprint) {
        await tx.manualDepositIdempotency.create({
          data: {
            adminId,
            idempotencyKey: normalizedIdempotencyKey,
            requestFingerprint,
            depositId: deposit.id,
            userId,
            username: user.username,
            amount: decimalAmount,
            network,
            reason,
            creditedAt: now,
          },
        });
      }

      result = {
        depositId:    deposit.id,
        userId,
        username:     user.username,
        amount:       decimalAmount.toFixed(2),
        network,
        reason,
        approvalMode: "MANUAL_ADMIN",
        creditedAt:   now,
      };
    }, { timeout: 30_000 });
  } catch (err) {
    if (normalizedIdempotencyKey && isUniqueConstraintError(err)) {
      const existing = await prisma.manualDepositIdempotency.findUnique({
        where: {
          adminId_idempotencyKey: {
            adminId,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw idempotencyKeyReuseError();
        }
        return resultFromIdempotencyRecord(existing);
      }
    }
    throw err;
  }

  void prisma.wallet.findUnique({ where: { userId }, select: { depositWallet: true } })
    .then(w => w && writeLedgerEntry({
      referenceId:     result!.depositId,
      referenceType:   "manual_deposit",
      memberId:        userId,
      username:        userId,
      transactionType: "DEPOSIT",
      amount:          decimalAmount,
      debitCredit:     "CREDIT",
      walletType:      "DEPOSIT_WALLET",
      closingBalance:  w.depositWallet,
      metadata:        { network, reason, adminId, approvalMode: "MANUAL_ADMIN" },
    }))
    .catch(err => logger.error({ err }, "ledger: manual deposit write failed"));

  // Notify user — outside the transaction so a notification failure never
  // rolls back the already-credited wallet
  void notificationService.create({
    userId,
    type:    "DEPOSIT_APPROVED",
    title:   "Manual Deposit Received",
    message: `An administrator has credited your Deposit Wallet with ${decimalAmount.toFixed(2)} USDT. Reason: ${reason}`,
    metadata: {
      approvalMode: "MANUAL_ADMIN",
      depositId:    result!.depositId,
      amount:       decimalAmount.toFixed(2),
      network,
      reason,
    },
  });

  return result!;
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
  idempotencyKey?: string,
) {
  const { userId, walletType, amount, reason, notes } = input;
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);

  if (walletType === "depositWallet") {
    const result = await createManualAdminDeposit(adminId, {
      userId, amount, network: "BEP20", reason, notes,
    }, ip, normalizedIdempotencyKey);
    return {
      userId:      result.userId,
      username:    result.username,
      walletType:  "depositWallet" as const,
      amount:      result.amount,
      reason:      result.reason,
      creditedAt:  result.creditedAt,
    };
  }

  if (normalizedIdempotencyKey) {
    throw new AppError(
      "Idempotency-Key is only supported for depositWallet credits",
      HTTP_STATUS.BAD_REQUEST,
      "IDEMPOTENCY_KEY_WALLET_MISMATCH",
    );
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
