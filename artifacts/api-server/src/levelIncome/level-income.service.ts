import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { LevelIncomeHistoryQuery } from "./level-income.schema";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Level rules: level → percentage (stored as whole number, e.g. 1 = 1%) */
const LEVEL_RULES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 1,
};

const MAX_LEVELS = 5;

// ── Level income propagation ──────────────────────────────────────────────────

/*
 * Level Income Business Rule — Sprint 28J
 *
 * Pure referral commission. Binary qualification does NOT apply.
 *
 * Trigger:    A referred user makes a qualifying investment.
 * Recipients: First 5 levels of the sponsor (referral) chain.
 * Amount:     1% of investment per level.
 *
 * Every sponsor within the first five referral levels receives income
 * unconditionally — no investment requirement, no binary left/right
 * referral requirement, no rank or KYC check.
 *
 * Binary qualification belongs exclusively to the Binary Matching,
 * Orbit, and Salary engines (isBinaryQualified in eligibility.service).
 */

/**
 * Walk up the sponsor chain and pay level income to each ancestor.
 *
 * Called inside the createInvestment Prisma transaction — all payouts are
 * atomic with the investment creation.
 *
 * Algorithm:
 *   - Start at sourceUser, walk up via sponsorId up to MAX_LEVELS times.
 *   - For each ancestor that exists, apply the level % to investmentAmount.
 *   - Credit withdrawalWallet, create LevelIncome + WalletTransaction records.
 *   - If the chain ends before MAX_LEVELS (no sponsor), stop early.
 *   - No qualification gate — every ancestor within 5 levels is paid.
 */
export interface LevelIncomeTarget {
  receiverUserId: string;
  incomeAmount:   Prisma.Decimal;
  level:          number;
}

export async function processLevelIncome(
  tx: Prisma.TransactionClient,
  sourceUserId:     string,
  investmentId:     string,
  investmentAmount: Prisma.Decimal,
): Promise<LevelIncomeTarget[]> {
  // Walk up the sponsor chain, fetching one level at a time.
  // We only need sponsorId and the wallet, so keep the select minimal.
  const targets: LevelIncomeTarget[] = [];
  let currentUserId = sourceUserId;

  for (let level = 1; level <= MAX_LEVELS; level++) {
    // Find the current user's sponsor
    const current = await tx.user.findUnique({
      where:  { id: currentUserId },
      select: { sponsorId: true },
    });

    const ancestorId = current?.sponsorId;
    if (!ancestorId) break; // Chain ends — no more levels to pay

    const pct     = LEVEL_RULES[level]!;
    const percentage    = new Prisma.Decimal(pct);
    const incomeAmount  = investmentAmount.times(percentage).div(100);

    // Credit ancestor's withdrawal wallet
    const wallet = await tx.wallet.update({
      where:  { userId: ancestorId },
      data:   { withdrawalWallet: { increment: incomeAmount } },
      select: { id: true },
    });

    // LevelIncome ledger record
    await tx.levelIncome.create({
      data: {
        receiverUserId:  ancestorId,
        sourceUserId,
        level,
        investmentId,
        investmentAmount,
        percentage,
        incomeAmount,
      },
    });

    // Wallet audit record
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId:      ancestorId,
        type:        "LEVEL_INCOME",
        status:      "SUCCESS",
        amount:      incomeAmount,
        description: `Level ${level} income — ${pct}% of $${investmentAmount.toFixed(2)} investment by ${sourceUserId}`,
        metadata:    { level, sourceUserId, investmentId, percentage: pct, investmentAmount: investmentAmount.toFixed(8) },
      },
    });

    targets.push({ receiverUserId: ancestorId, incomeAmount, level });

    // Move up to the next ancestor
    currentUserId = ancestorId;
  }

  return targets;
}

// ── History query ─────────────────────────────────────────────────────────────

const historySelect = {
  id:               true,
  level:            true,
  investmentAmount: true,
  percentage:       true,
  incomeAmount:     true,
  createdAt:        true,
  source: {
    select: {
      id:        true,
      username:  true,
      firstName: true,
      lastName:  true,
    },
  },
  investment: {
    select: {
      id:       true,
      amount:   true,
      planType: true,
    },
  },
} as const;

export async function getLevelIncomeHistory(
  receiverUserId: string,
  query: LevelIncomeHistoryQuery,
) {
  const exists = await prisma.user.findUnique({
    where: { id: receiverUserId },
    select: { id: true },
  });
  if (!exists) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const { page, limit, sourceUserId, level } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.LevelIncomeWhereInput = {
    receiverUserId,
    ...(sourceUserId && { sourceUserId }),
    ...(level        && { level }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.levelIncome.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  historySelect,
    }),
    prisma.levelIncome.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
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

// ── Summary query ─────────────────────────────────────────────────────────────

export async function getLevelIncomeSummary(receiverUserId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: receiverUserId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  // Level-wise breakdown (groupBy level)
  const grouped = await prisma.levelIncome.groupBy({
    by:     ["level"],
    where:  { receiverUserId },
    _sum:   { incomeAmount: true },
    _count: { id: true },
    orderBy: { level: "asc" },
  });

  // Overall totals
  const totals = await prisma.levelIncome.aggregate({
    where: { receiverUserId },
    _sum:  { incomeAmount: true },
    _count: { id: true },
  });

  const breakdown = grouped.map((g) => ({
    level:       g.level,
    count:       g._count.id,
    incomeAmount: g._sum.incomeAmount ?? new Prisma.Decimal(0),
    percentage:  LEVEL_RULES[g.level] ?? 0,
  }));

  return {
    userId:       user.id,
    username:     user.username,
    totalIncome:  totals._sum.incomeAmount ?? new Prisma.Decimal(0),
    totalPayouts: totals._count.id,
    breakdown,
  };
}
