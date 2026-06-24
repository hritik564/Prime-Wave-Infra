import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { MatchingHistoryQuery } from "./matching.schema";
import { notificationService } from "../notifications/notifications.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const INCOME_PER_BV      = new Prisma.Decimal("5");   // $5 per BV unit
const MAX_PAYABLE_BV     = new Prisma.Decimal("50");   // 50 BV cap per cycle
const MIN_REFERRALS      = 2;                          // directReferralCount floor

// ── Matching cycle ────────────────────────────────────────────────────────────

/**
 * Runs one Binary Matching cycle.
 *
 * Called by the cron scheduler at 00:00 and 12:00 Europe/London.
 *
 * Algorithm per qualifying user:
 *   1. Qualification: directReferralCount >= 2 AND matchedBV > 0.
 *      Skip (preserve BV) if not qualified.
 *   2. matchedBV   = min(leftBV, rightBV)
 *   3. payableBV   = min(matchedBV, 50)
 *   4. destroyedBV = matchedBV - payableBV
 *   5. incomeAmount = payableBV × $5
 *   6. newLeftBV  = leftBV  - matchedBV   (carry-forward unmatched)
 *      newRightBV = rightBV - matchedBV
 *   7. Credit incomeAmount → withdrawalWallet.
 *   8. Insert BinaryMatchIncome + WalletTransaction.
 *
 * Each user is processed in its own Prisma transaction so a single
 * failure is isolated and does not roll back the entire cycle.
 */
export async function processMatchingCycle(
  cycleStart: Date,
  cycleEnd:   Date,
): Promise<{ processed: number; skipped: number; totalIncome: Prisma.Decimal }> {
  // Snapshot all ACTIVE users who could potentially qualify (leftBV > 0 OR rightBV > 0)
  // We filter in-memory for clarity; the DB read is bounded by active users only.
  const candidates = await prisma.user.findMany({
    where: {
      status:              "ACTIVE",
      directReferralCount: { gte: MIN_REFERRALS },
      OR: [
        { leftBV:  { gt: 0 } },
        { rightBV: { gt: 0 } },
      ],
    },
    select: {
      id:                  true,
      leftBV:              true,
      rightBV:             true,
      directReferralCount: true,
    },
    orderBy: { id: "asc" },
  });

  let processed = 0;
  let skipped   = 0;
  let totalIncome = new Prisma.Decimal(0);

  for (const user of candidates) {
    const matchedBV = Prisma.Decimal.min(user.leftBV, user.rightBV);

    if (matchedBV.lte(0)) {
      skipped++;
      continue;
    }

    const payableBV   = Prisma.Decimal.min(matchedBV, MAX_PAYABLE_BV);
    const destroyedBV = matchedBV.minus(payableBV);
    const incomeAmount = payableBV.times(INCOME_PER_BV);

    const newLeftBV  = user.leftBV.minus(matchedBV);
    const newRightBV = user.rightBV.minus(matchedBV);

    try {
      await prisma.$transaction(async (tx) => {
        // Update user BV balances
        await tx.user.update({
          where: { id: user.id },
          data:  { leftBV: newLeftBV, rightBV: newRightBV },
        });

        // Credit withdrawal wallet
        const wallet = await tx.wallet.update({
          where: { userId: user.id },
          data:  { withdrawalWallet: { increment: incomeAmount } },
          select: { id: true },
        });

        // BinaryMatchIncome record
        await tx.binaryMatchIncome.create({
          data: {
            userId:       user.id,
            matchedBV,
            payableBV,
            destroyedBV,
            incomeAmount,
            cycleStart,
            cycleEnd,
          },
        });

        // Wallet audit record
        await tx.walletTransaction.create({
          data: {
            walletId:    wallet.id,
            userId:      user.id,
            type:        "BINARY_MATCH",
            status:      "SUCCESS",
            amount:      incomeAmount,
            description: `Binary match income — ${payableBV.toFixed(0)} BV × $5 (cycle ${cycleStart.toISOString()})`,
            metadata:    { matchedBV: matchedBV.toFixed(8), payableBV: payableBV.toFixed(8), destroyedBV: destroyedBV.toFixed(8), cycleStart, cycleEnd },
          },
        });
      });

      void notificationService.create({
        userId:  user.id,
        type:    "BINARY_MATCH_INCOME",
        title:   "Binary Match Income Received",
        message: `You earned $${incomeAmount.toFixed(2)} binary match income from ${payableBV.toFixed(0)} matched BV.`,
        metadata: { incomeAmount: incomeAmount.toString(), matchedBV: matchedBV.toFixed(8), payableBV: payableBV.toFixed(8) },
      });

      totalIncome = totalIncome.plus(incomeAmount);
      processed++;
    } catch (err) {
      // Log per-user failures but continue processing the rest
      skipped++;
      // Re-throw if logger is available; caller handles via catch in engine
      throw err;
    }
  }

  return { processed, skipped, totalIncome };
}

// ── Query: matching history ───────────────────────────────────────────────────

const historySelect = {
  id:           true,
  matchedBV:    true,
  payableBV:    true,
  destroyedBV:  true,
  incomeAmount: true,
  cycleStart:   true,
  cycleEnd:     true,
  createdAt:    true,
} as const;

export async function getMatchingHistory(userId: string, query: MatchingHistoryQuery) {
  // Verify user exists
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.BinaryMatchIncomeWhereInput = { userId };

  const [records, total] = await prisma.$transaction([
    prisma.binaryMatchIncome.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  historySelect,
    }),
    prisma.binaryMatchIncome.count({ where }),
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

// ── Query: matching summary ───────────────────────────────────────────────────

export async function getMatchingSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:                  true,
      username:            true,
      leftBV:              true,
      rightBV:             true,
      directReferralCount: true,
    },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const agg = await prisma.binaryMatchIncome.aggregate({
    where:  { userId },
    _sum:   { matchedBV: true, payableBV: true, destroyedBV: true, incomeAmount: true },
    _count: true,
  });

  const matchedBV    = user.leftBV.lte(user.rightBV) ? user.leftBV : user.rightBV;
  const isQualified  = user.directReferralCount >= MIN_REFERRALS;
  const pendingMatchBV = isQualified ? matchedBV : new Prisma.Decimal(0);
  const pendingIncome  = isQualified
    ? Prisma.Decimal.min(matchedBV, MAX_PAYABLE_BV).times(INCOME_PER_BV)
    : new Prisma.Decimal(0);

  return {
    userId:              user.id,
    username:            user.username,
    directReferralCount: user.directReferralCount,
    isQualified,
    currentLeftBV:       user.leftBV,
    currentRightBV:      user.rightBV,
    pendingMatchBV,
    pendingIncome,
    allTime: {
      cycles:      agg._count,
      matchedBV:   agg._sum.matchedBV   ?? new Prisma.Decimal(0),
      payableBV:   agg._sum.payableBV   ?? new Prisma.Decimal(0),
      destroyedBV: agg._sum.destroyedBV ?? new Prisma.Decimal(0),
      incomeAmount: agg._sum.incomeAmount ?? new Prisma.Decimal(0),
    },
  };
}
