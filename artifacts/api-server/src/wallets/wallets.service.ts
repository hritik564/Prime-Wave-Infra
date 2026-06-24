import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { TransferInput, HistoryQueryInput } from "./wallets.schema";

// ── Constants ────────────────────────────────────────────────────────────────

const TRANSFER_FEE_PERCENT = new Prisma.Decimal("15");
const HUNDRED = new Prisma.Decimal("100");

// ── Get balances ──────────────────────────────────────────────────────────────

export async function getWalletBalances(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      id: true,
      depositWallet: true,
      incomeWallet: true,
      withdrawalWallet: true,
      updatedAt: true,
    },
  });

  if (!wallet) {
    throw new AppError("Wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }

  return wallet;
}

// ── Transfer: Income → Withdrawal (15% fee) ───────────────────────────────────

export async function transferIncomeToWithdrawal(userId: string, input: TransferInput) {
  const grossAmount = new Prisma.Decimal(input.amount.toString());
  const fee = grossAmount.mul(TRANSFER_FEE_PERCENT).div(HUNDRED);
  const netAmount = grossAmount.sub(fee);

  return prisma.$transaction(async (tx) => {
    // Lock and read wallet inside the transaction
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true, incomeWallet: true },
    });

    if (!wallet) {
      throw new AppError("Wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
    }

    if (wallet.incomeWallet.lessThan(grossAmount)) {
      throw new AppError(
        `Insufficient income wallet balance. Available: ${wallet.incomeWallet.toFixed(8)}`,
        HTTP_STATUS.BAD_REQUEST,
        "INSUFFICIENT_BALANCE",
      );
    }

    // Atomic balance update
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        incomeWallet: { decrement: grossAmount },
        withdrawalWallet: { increment: netAmount },
      },
      select: {
        depositWallet: true,
        incomeWallet: true,
        withdrawalWallet: true,
      },
    });

    // Audit record
    const transaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: "INCOME_TRANSFER",
        status: "SUCCESS",
        amount: grossAmount,
        fee,
        netAmount,
        description: `Income → Withdrawal transfer (${TRANSFER_FEE_PERCENT}% fee deducted)`,
      },
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        fee: true,
        netAmount: true,
        description: true,
        createdAt: true,
      },
    });

    return { transaction, wallet: updatedWallet };
  });
}

// ── Paginated history ─────────────────────────────────────────────────────────

export async function getWalletHistory(userId: string, query: HistoryQueryInput) {
  const { page, limit, type, status } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.WalletTransactionWhereInput = {
    userId,
    ...(type !== undefined && { type }),
    ...(status !== undefined && { status }),
  };

  const [transactions, total] = await prisma.$transaction([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        fee: true,
        netAmount: true,
        description: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: transactions,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
