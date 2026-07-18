import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { MatchingHistoryQuery } from "./matching.schema";
import { notificationService } from "../notifications/notifications.service";
import { writeLedgerEntry } from "../ledger/ledger.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const INCOME_PER_BV  = new Prisma.Decimal("5");  // $5 per BV unit
const MAX_PAYABLE_BV = new Prisma.Decimal("50");  // 50 BV cap per cycle
const MIN_REFERRALS  = 2;                          // directReferralCount floor

// ── Result type ───────────────────────────────────────────────────────────────

export interface MatchingCycleFailure {
  userId:          string;
  username:        string;
  matchedBV:       string;
  expectedIncome:  string;
  error:           string;
  timestamp:       string;
}

export interface MatchingCycleResult {
  processed:          number;
  skipped:            number;
  failedUsers:        MatchingCycleFailure[];
  totalIncome:        Prisma.Decimal;
  totalMatchedBV:     Prisma.Decimal;
  totalRewardedBV:    Prisma.Decimal;
  totalFlushedBV:     Prisma.Decimal;
  totalCarryFwdLeft:  Prisma.Decimal;
  totalCarryFwdRight: Prisma.Decimal;
}

// ── Matching cycle ────────────────────────────────────────────────────────────

/**
 * Runs one Binary Matching cycle.
 *
 * Called by the cron scheduler at 00:00 and 12:00 Europe/London.
 *
 * Algorithm per qualifying user:
 *   1. Qualification: directReferralCount >= 2 AND matchedBV > 0.
 *      Skip (preserve BV) if not qualified.
 *   2. matchedBV        = min(leftBV, rightBV)
 *   3. rewardedBV       = min(matchedBV, 50)    — capped at 50 BV/cycle
 *   4. flushedBV        = matchedBV             — ALL matched BV is flushed
 *   5. incomeAmount     = rewardedBV × $5       — max $250/cycle
 *   6. carryForwardLeft  = leftBV  - matchedBV  — only unmatched BV carries forward
 *      carryForwardRight = rightBV - matchedBV
 *   7. Credit incomeAmount → withdrawalWallet.
 *   8. Insert BinaryMatchIncome + WalletTransaction.
 *
 * Each user is processed in its own Prisma transaction so a single
 * failure is isolated and does not roll back the entire cycle.
 */
export async function processMatchingCycle(
  cycleStart: Date,
  cycleEnd:   Date,
): Promise<MatchingCycleResult> {
  // Active Member Qualification (LOCKED):
  //   • ≥1 direct referral on LEFT leg
  //   • ≥1 direct referral on RIGHT leg
  //   • At least one active investment ≥ $100
  const candidates = await prisma.user.findMany({
    where: {
      status:           "ACTIVE",
      directLeftCount:  { gte: 1 },
      directRightCount: { gte: 1 },
      investments: {
        some: {
          status: "ACTIVE",
          amount: { gte: new Prisma.Decimal("100") },
        },
      },
      OR: [
        { leftBV:  { gt: 0 } },
        { rightBV: { gt: 0 } },
      ],
    },
    select: {
      id:       true,
      username: true,
      leftBV:   true,
      rightBV:  true,
    },
    orderBy: { id: "asc" },
  });

  let processed           = 0;
  let skipped             = 0;
  const failedUsers: MatchingCycleFailure[] = [];
  let totalIncome         = new Prisma.Decimal(0);
  let totalMatchedBV      = new Prisma.Decimal(0);
  let totalRewardedBV     = new Prisma.Decimal(0);
  let totalFlushedBV      = new Prisma.Decimal(0);
  let totalCarryFwdLeft   = new Prisma.Decimal(0);
  let totalCarryFwdRight  = new Prisma.Decimal(0);

  for (const user of candidates) {
    const matchedBV = Prisma.Decimal.min(user.leftBV, user.rightBV);

    if (matchedBV.lte(0)) {
      skipped++;
      continue;
    }

    // Rewarded BV is capped; flushed BV is always the full matched amount
    const rewardedBV  = Prisma.Decimal.min(matchedBV, MAX_PAYABLE_BV);
    const destroyedBV = matchedBV.minus(rewardedBV);   // matched but not rewarded
    const flushedBV   = matchedBV;                     // ALL matched BV is flushed
    const incomeAmount = rewardedBV.times(INCOME_PER_BV);

    // Only unmatched BV carries forward
    const carryForwardLeft  = user.leftBV.minus(matchedBV);
    const carryForwardRight = user.rightBV.minus(matchedBV);

    try {
      await prisma.$transaction(async (tx) => {
        // Update user BV balances
        await tx.user.update({
          where: { id: user.id },
          data:  { leftBV: carryForwardLeft, rightBV: carryForwardRight },
        });

        // Credit withdrawal wallet
        const wallet = await tx.wallet.update({
          where:  { userId: user.id },
          data:   { withdrawalWallet: { increment: incomeAmount } },
          select: { id: true, withdrawalWallet: true },
        });

        // BinaryMatchIncome record — full transparency
        await tx.binaryMatchIncome.create({
          data: {
            userId:           user.id,
            matchedBV,
            payableBV:        rewardedBV,
            destroyedBV,
            flushedBV,
            carryForwardLeft,
            carryForwardRight,
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
            description: `Binary matching income — ${rewardedBV.toFixed(0)} rewarded BV × $5 (cycle ${cycleStart.toISOString()})`,
            metadata: {
              matchedBV:         matchedBV.toFixed(8),
              rewardedBV:        rewardedBV.toFixed(8),
              flushedBV:         flushedBV.toFixed(8),
              carryForwardLeft:  carryForwardLeft.toFixed(8),
              carryForwardRight: carryForwardRight.toFixed(8),
              cycleStart,
              cycleEnd,
            },
          },
        });
      });

      void prisma.wallet.findUnique({ where: { userId: user.id }, select: { withdrawalWallet: true } })
        .then(w => w && writeLedgerEntry({
          referenceId:     user.id,
          referenceType:   "binary_match",
          memberId:        user.id,
          username:        user.username,
          transactionType: "MATCHING_BONUS",
          amount:          incomeAmount,
          debitCredit:     "CREDIT",
          walletType:      "WITHDRAWAL_WALLET",
          closingBalance:  w.withdrawalWallet,
          metadata:        { matchedBV: matchedBV.toFixed(8), rewardedBV: rewardedBV.toFixed(8), cycleStart, cycleEnd },
        }))
        .catch(err => logger.error({ err }, "ledger: matching bonus write failed"));

      void notificationService.create({
        userId:  user.id,
        type:    "BINARY_MATCH_INCOME",
        title:   "Binary Matching Complete",
        message: [
          `Matched BV: ${matchedBV.toFixed(2)}`,
          `Rewarded BV: ${rewardedBV.toFixed(2)}`,
          `Flushed BV: ${flushedBV.toFixed(2)}`,
          `Carry Forward Left: ${carryForwardLeft.toFixed(2)}`,
          `Carry Forward Right: ${carryForwardRight.toFixed(2)}`,
          `Income Credited: $${incomeAmount.toFixed(2)}`,
        ].join("\n"),
        metadata: {
          matchedBV:         matchedBV.toString(),
          rewardedBV:        rewardedBV.toString(),
          flushedBV:         flushedBV.toString(),
          carryForwardLeft:  carryForwardLeft.toString(),
          carryForwardRight: carryForwardRight.toString(),
          incomeAmount:      incomeAmount.toString(),
        },
      });

      totalIncome        = totalIncome.plus(incomeAmount);
      totalMatchedBV     = totalMatchedBV.plus(matchedBV);
      totalRewardedBV    = totalRewardedBV.plus(rewardedBV);
      totalFlushedBV     = totalFlushedBV.plus(flushedBV);
      totalCarryFwdLeft  = totalCarryFwdLeft.plus(carryForwardLeft);
      totalCarryFwdRight = totalCarryFwdRight.plus(carryForwardRight);
      processed++;
    } catch (err) {
      skipped++;
      const errMsg = err instanceof Error ? err.message : String(err);
      const stack  = err instanceof Error ? err.stack   : undefined;

      logger.error(
        {
          userId:         user.id,
          username:       user.username,
          cycleId:        cycleStart.toISOString(),
          matchedBV:      matchedBV.toFixed(8),
          expectedIncome: rewardedBV.times(INCOME_PER_BV).toFixed(2),
          error:          errMsg,
          stack,
          cycleStart,
          cycleEnd,
        },
        "Binary matching cycle: user processing failed — skipping user, continuing cycle",
      );

      failedUsers.push({
        userId:         user.id,
        username:       user.username,
        matchedBV:      matchedBV.toFixed(8),
        expectedIncome: rewardedBV.times(INCOME_PER_BV).toFixed(2),
        error:          errMsg,
        timestamp:      new Date().toISOString(),
      });
    }
  }

  return {
    processed,
    skipped,
    failedUsers,
    totalIncome,
    totalMatchedBV,
    totalRewardedBV,
    totalFlushedBV,
    totalCarryFwdLeft,
    totalCarryFwdRight,
  };
}

// ── Query: matching history ───────────────────────────────────────────────────

const historySelect = {
  id:               true,
  matchedBV:        true,
  payableBV:        true,
  destroyedBV:      true,
  flushedBV:        true,
  carryForwardLeft:  true,
  carryForwardRight: true,
  incomeAmount:     true,
  cycleStart:       true,
  cycleEnd:         true,
  createdAt:        true,
} as const;

export async function getMatchingHistory(userId: string, query: MatchingHistoryQuery) {
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
    _sum:   {
      matchedBV:         true,
      payableBV:         true,
      destroyedBV:       true,
      flushedBV:         true,
      carryForwardLeft:  true,
      carryForwardRight: true,
      incomeAmount:      true,
    },
    _count: true,
  });

  const matchedBV      = user.leftBV.lte(user.rightBV) ? user.leftBV : user.rightBV;
  const isQualified    = user.directReferralCount >= MIN_REFERRALS;
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
      cycles:            agg._count,
      matchedBV:         agg._sum.matchedBV         ?? new Prisma.Decimal(0),
      rewardedBV:        agg._sum.payableBV          ?? new Prisma.Decimal(0),
      destroyedBV:       agg._sum.destroyedBV        ?? new Prisma.Decimal(0),
      flushedBV:         agg._sum.flushedBV          ?? new Prisma.Decimal(0),
      carryForwardLeft:  agg._sum.carryForwardLeft   ?? new Prisma.Decimal(0),
      carryForwardRight: agg._sum.carryForwardRight  ?? new Prisma.Decimal(0),
      incomeAmount:      agg._sum.incomeAmount       ?? new Prisma.Decimal(0),
    },
  };
}
