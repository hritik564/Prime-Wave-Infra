import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { WalletAdjustmentInput } from "./admin-dashboard.schema";
import type { TransactionType } from "@prisma/client";

// ── Wallet field and transaction type mapping ─────────────────────────────────

const walletFieldMap = {
  DEPOSIT:    "depositWallet",
  INCOME:     "incomeWallet",
  WITHDRAWAL: "withdrawalWallet",
} as const satisfies Record<WalletAdjustmentInput["walletType"], keyof Prisma.WalletUpdateInput>;

const txTypeMap: Record<WalletAdjustmentInput["walletType"], TransactionType> = {
  DEPOSIT:    "DEPOSIT",
  INCOME:     "INCOME_TRANSFER",
  WITHDRAWAL: "WITHDRAWAL",
};

// ── Manual wallet adjustment ──────────────────────────────────────────────────

/**
 * Applies a manual credit (positive amount) or debit (negative amount)
 * to one of a user's wallet balances.
 *
 * Rules:
 *  - amount > 0 → credit
 *  - amount < 0 → debit; balance may not go below 0
 *  - reason is required (min 1 char)
 *
 * Atomically:
 *  1. Checks target wallet balance for debits.
 *  2. Updates the wallet field.
 *  3. Creates a WalletTransaction record.
 *  4. Creates an AdminLog entry.
 */
export async function applyWalletAdjustment(
  adminId: string,
  input:   WalletAdjustmentInput,
) {
  const { userId, walletType, amount, reason } = input;
  const decimalAmount = new Prisma.Decimal(amount);
  const isDebit       = decimalAmount.isNegative();
  const absAmount     = decimalAmount.abs();

  // ── Load wallet ───────────────────────────────────────────────────────────
  const wallet = await prisma.wallet.findUnique({
    where:  { userId },
    select: { id: true, depositWallet: true, incomeWallet: true, withdrawalWallet: true },
  });

  if (!wallet) {
    throw new AppError("User wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }

  // ── Balance guard for debits ──────────────────────────────────────────────
  if (isDebit) {
    const currentBalance = wallet[walletFieldMap[walletType]];
    if ((currentBalance as Prisma.Decimal).lt(absAmount)) {
      throw new AppError(
        `Insufficient ${walletType.toLowerCase()} wallet balance for debit. Available: $${(currentBalance as Prisma.Decimal).toFixed(2)}`,
        HTTP_STATUS.BAD_REQUEST,
        "INSUFFICIENT_BALANCE",
      );
    }
  }

  // ── Verify user exists ────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const field = walletFieldMap[walletType];

  await prisma.$transaction(async (tx) => {
    // 1. Update wallet balance
    await tx.wallet.update({
      where: { id: wallet.id },
      data:  { [field]: { increment: decimalAmount } },
    });

    // 2. WalletTransaction record
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId,
        type:        txTypeMap[walletType],
        status:      "SUCCESS",
        amount:      absAmount,
        description: `Manual admin adjustment (${isDebit ? "debit" : "credit"}) — ${reason}`,
        metadata: {
          walletType,
          adjustmentAmount: decimalAmount.toString(),
          reason,
          performedBy: adminId,
        },
      },
    });

    // 3. AdminLog
    await tx.adminLog.create({
      data: {
        adminId,
        action:       "WALLET_ADJUSTMENT",
        targetUserId: userId,
        details: {
          walletType,
          amount:    decimalAmount.toString(),
          direction: isDebit ? "debit" : "credit",
          reason,
          username:  user.username,
        },
      },
    });
  });

  return {
    userId,
    username:   user.username,
    walletType,
    adjustment: decimalAmount,
    direction:  isDebit ? "debit" : "credit",
    reason,
  };
}
