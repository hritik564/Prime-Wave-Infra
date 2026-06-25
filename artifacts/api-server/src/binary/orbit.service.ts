import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { getNumericSetting } from "../config/settings";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { OrbitHistoryQuery } from "./orbit.schema";
import { notificationService } from "../notifications/notifications.service";

// ── Settings keys ─────────────────────────────────────────────────────────────

const SETTINGS = {
  BV_PER_REWARD:         "orbit.bv_per_reward",
  MAX_REWARDS_PER_CYCLE: "orbit.max_rewards_per_cycle",
  INCOME_PER_REWARD:     "orbit.income_per_reward",
  MIN_REFERRALS:         "orbit.min_referrals",
} as const;

const DEFAULTS = {
  BV_PER_REWARD:         150,
  MAX_REWARDS_PER_CYCLE: 1,
  INCOME_PER_REWARD:     500,
  MIN_REFERRALS:         2,
} as const;

// ── Result type ───────────────────────────────────────────────────────────────

export interface OrbitCycleResult {
  processed:          number;
  skipped:            number;
  totalIncome:        Prisma.Decimal;
  totalMatchedBV:     Prisma.Decimal;
  totalFlushedBV:     Prisma.Decimal;
  totalCarryFwdLeft:  Prisma.Decimal;
  totalCarryFwdRight: Prisma.Decimal;
  totalRewards:       number;
}

// ── Orbit cycle ───────────────────────────────────────────────────────────────

/**
 * Runs one Binary Orbit cycle.
 *
 * Called by the cron scheduler at 00:00 and 12:00 Europe/London.
 *
 * Algorithm per qualifying user (settings read from SystemSettings):
 *   1. Qualification: directReferralCount >= minReferrals AND rewardCount > 0.
 *      Skip (preserve BV) if not qualified.
 *   2. matchedBV           = min(leftBV, rightBV)
 *   3. rewardCount         = floor(matchedBV / bvPerReward)   — full orbits earned
 *   4. payableRewardCount  = min(rewardCount, maxPerCycle)    — capped at 1/cycle
 *   5. destroyedRewardCount= rewardCount - payableRewardCount — excess orbits
 *   6. incomeAmount        = payableRewardCount × incomePerReward
 *   7. flushedBV           = matchedBV     — ALL matched BV flushed, not just consumed
 *      carryForwardLeft    = leftBV  - matchedBV
 *      carryForwardRight   = rightBV - matchedBV
 *   8. Credit incomeAmount → withdrawalWallet.
 *   9. Insert BinaryOrbitIncome + WalletTransaction.
 *
 * Each user is processed in its own Prisma transaction — one failure is isolated.
 */
export async function processOrbitCycle(
  cycleStart: Date,
  cycleEnd:   Date,
): Promise<OrbitCycleResult> {
  const [bvPerReward, maxRewardsPerCycle, incomePerReward, minReferrals] = await Promise.all([
    getNumericSetting(SETTINGS.BV_PER_REWARD,         DEFAULTS.BV_PER_REWARD),
    getNumericSetting(SETTINGS.MAX_REWARDS_PER_CYCLE, DEFAULTS.MAX_REWARDS_PER_CYCLE),
    getNumericSetting(SETTINGS.INCOME_PER_REWARD,     DEFAULTS.INCOME_PER_REWARD),
    getNumericSetting(SETTINGS.MIN_REFERRALS,         DEFAULTS.MIN_REFERRALS),
  ]);

  const decBvPerReward     = new Prisma.Decimal(bvPerReward);
  const decIncomePerReward = new Prisma.Decimal(incomePerReward);

  const candidates = await prisma.user.findMany({
    where: {
      status:              "ACTIVE",
      directReferralCount: { gte: minReferrals },
      leftBV:              { gt: 0 },
      rightBV:             { gt: 0 },
    },
    select: {
      id:                  true,
      leftBV:              true,
      rightBV:             true,
      directReferralCount: true,
    },
    orderBy: { id: "asc" },
  });

  let processed           = 0;
  let skipped             = 0;
  let totalIncome         = new Prisma.Decimal(0);
  let totalMatchedBV      = new Prisma.Decimal(0);
  let totalFlushedBV      = new Prisma.Decimal(0);
  let totalCarryFwdLeft   = new Prisma.Decimal(0);
  let totalCarryFwdRight  = new Prisma.Decimal(0);
  let totalRewards        = 0;

  for (const user of candidates) {
    const matchedBV   = Prisma.Decimal.min(user.leftBV, user.rightBV);
    const rewardCount = Math.floor(matchedBV.div(decBvPerReward).toNumber());

    if (rewardCount <= 0) {
      skipped++;
      continue;
    }

    const payableRewardCount   = Math.min(rewardCount, maxRewardsPerCycle);
    const destroyedRewardCount = rewardCount - payableRewardCount;
    const incomeAmount         = new Prisma.Decimal(payableRewardCount).times(decIncomePerReward);

    // ALL matched BV is flushed — only unmatched BV carries forward
    const flushedBV         = matchedBV;
    const carryForwardLeft  = user.leftBV.minus(matchedBV);
    const carryForwardRight = user.rightBV.minus(matchedBV);

    try {
      await prisma.$transaction(async (tx) => {
        // Update user BV balances — flush ALL matched BV
        await tx.user.update({
          where: { id: user.id },
          data:  { leftBV: carryForwardLeft, rightBV: carryForwardRight },
        });

        // Credit withdrawal wallet
        const wallet = await tx.wallet.update({
          where:  { userId: user.id },
          data:   { withdrawalWallet: { increment: incomeAmount } },
          select: { id: true },
        });

        // BinaryOrbitIncome record — full transparency
        await tx.binaryOrbitIncome.create({
          data: {
            userId: user.id,
            matchedBV,
            rewardCount,
            destroyedRewardCount,
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
            type:        "BINARY_ORBIT",
            status:      "SUCCESS",
            amount:      incomeAmount,
            description: `Binary orbit income — ${payableRewardCount} orbit × $${incomePerReward} (cycle ${cycleStart.toISOString()})`,
            metadata: {
              matchedBV:         matchedBV.toFixed(8),
              rewardCount,
              payableRewardCount,
              destroyedRewardCount,
              flushedBV:         flushedBV.toFixed(8),
              carryForwardLeft:  carryForwardLeft.toFixed(8),
              carryForwardRight: carryForwardRight.toFixed(8),
              bvPerReward,
              cycleStart,
              cycleEnd,
            },
          },
        });
      });

      void notificationService.create({
        userId:  user.id,
        type:    "BINARY_ORBIT_INCOME",
        title:   "Binary Orbit Complete",
        message: [
          `Matched BV: ${matchedBV.toFixed(2)}`,
          `Reward: $${incomeAmount.toFixed(2)}`,
          `Flushed BV: ${flushedBV.toFixed(2)}`,
          `Carry Forward Left: ${carryForwardLeft.toFixed(2)}`,
          `Carry Forward Right: ${carryForwardRight.toFixed(2)}`,
        ].join("\n"),
        metadata: {
          matchedBV:         matchedBV.toString(),
          flushedBV:         flushedBV.toString(),
          carryForwardLeft:  carryForwardLeft.toString(),
          carryForwardRight: carryForwardRight.toString(),
          incomeAmount:      incomeAmount.toString(),
          rewardCount,
          payableRewardCount,
        },
      });

      totalIncome        = totalIncome.plus(incomeAmount);
      totalMatchedBV     = totalMatchedBV.plus(matchedBV);
      totalFlushedBV     = totalFlushedBV.plus(flushedBV);
      totalCarryFwdLeft  = totalCarryFwdLeft.plus(carryForwardLeft);
      totalCarryFwdRight = totalCarryFwdRight.plus(carryForwardRight);
      totalRewards       += payableRewardCount;
      processed++;
    } catch {
      skipped++;
    }
  }

  return {
    processed,
    skipped,
    totalIncome,
    totalMatchedBV,
    totalFlushedBV,
    totalCarryFwdLeft,
    totalCarryFwdRight,
    totalRewards,
  };
}

// ── Query: orbit history ──────────────────────────────────────────────────────

const historySelect = {
  id:                   true,
  matchedBV:            true,
  rewardCount:          true,
  destroyedRewardCount: true,
  flushedBV:            true,
  carryForwardLeft:     true,
  carryForwardRight:    true,
  incomeAmount:         true,
  cycleStart:           true,
  cycleEnd:             true,
  createdAt:            true,
} as const;

export async function getOrbitHistory(userId: string, query: OrbitHistoryQuery) {
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.BinaryOrbitIncomeWhereInput = { userId };

  const [records, total] = await prisma.$transaction([
    prisma.binaryOrbitIncome.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  historySelect,
    }),
    prisma.binaryOrbitIncome.count({ where }),
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

// ── Query: orbit summary ──────────────────────────────────────────────────────

export async function getOrbitSummary(userId: string) {
  const [user, agg, bvPerReward, maxRewardsPerCycle, incomePerReward, minReferrals] =
    await Promise.all([
      prisma.user.findUnique({
        where:  { id: userId },
        select: {
          id:                  true,
          username:            true,
          leftBV:              true,
          rightBV:             true,
          directReferralCount: true,
        },
      }),
      prisma.binaryOrbitIncome.aggregate({
        where:  { userId },
        _sum:   { matchedBV: true, flushedBV: true, incomeAmount: true },
        _count: true,
      }),
      getNumericSetting(SETTINGS.BV_PER_REWARD,         DEFAULTS.BV_PER_REWARD),
      getNumericSetting(SETTINGS.MAX_REWARDS_PER_CYCLE, DEFAULTS.MAX_REWARDS_PER_CYCLE),
      getNumericSetting(SETTINGS.INCOME_PER_REWARD,     DEFAULTS.INCOME_PER_REWARD),
      getNumericSetting(SETTINGS.MIN_REFERRALS,         DEFAULTS.MIN_REFERRALS),
    ]);

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const isQualified = user.directReferralCount >= minReferrals;
  const matchedBV   = Prisma.Decimal.min(user.leftBV, user.rightBV);
  const rewardCount = Math.floor(matchedBV.div(new Prisma.Decimal(bvPerReward)).toNumber());

  const pendingRewardCount = isQualified ? Math.min(rewardCount, maxRewardsPerCycle) : 0;
  const pendingIncome      = new Prisma.Decimal(pendingRewardCount).times(new Prisma.Decimal(incomePerReward));

  return {
    userId:              user.id,
    username:            user.username,
    directReferralCount: user.directReferralCount,
    isQualified,
    currentLeftBV:       user.leftBV,
    currentRightBV:      user.rightBV,
    pendingRewardCount,
    pendingIncome,
    settings: {
      bvPerReward,
      maxRewardsPerCycle,
      incomePerReward,
      minReferrals,
    },
    allTime: {
      cycles:      agg._count,
      matchedBV:   agg._sum.matchedBV   ?? new Prisma.Decimal(0),
      flushedBV:   agg._sum.flushedBV   ?? new Prisma.Decimal(0),
      incomeAmount: agg._sum.incomeAmount ?? new Prisma.Decimal(0),
    },
  };
}
