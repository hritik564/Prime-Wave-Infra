import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { getNumericSetting } from "../config/settings";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { OrbitHistoryQuery } from "./orbit.schema";

// ── Settings keys ─────────────────────────────────────────────────────────────

const SETTINGS = {
  BV_PER_REWARD:         "orbit.bv_per_reward",
  MAX_REWARDS_PER_CYCLE: "orbit.max_rewards_per_cycle",
  INCOME_PER_REWARD:     "orbit.income_per_reward",
  MIN_REFERRALS:         "orbit.min_referrals",
} as const;

// Hardcoded fallbacks (used if SystemSettings row is missing)
const DEFAULTS = {
  BV_PER_REWARD:         150,
  MAX_REWARDS_PER_CYCLE: 1,
  INCOME_PER_REWARD:     500,
  MIN_REFERRALS:         2,
} as const;

// ── Orbit cycle ───────────────────────────────────────────────────────────────

/**
 * Runs one Binary Orbit cycle.
 *
 * Called by the cron scheduler at 00:00 and 12:00 Europe/London.
 *
 * Algorithm per qualifying user (settings read from SystemSettings):
 *   1. Qualification: directReferralCount >= minReferrals AND rewardCount > 0.
 *      Skip (preserve BV) if not qualified.
 *   2. matchedBV          = min(leftBV, rightBV)
 *   3. rewardCount        = floor(matchedBV / bvPerReward)
 *   4. payableRewardCount = min(rewardCount, maxRewardsPerCycle)
 *   5. destroyedRewardCount = rewardCount - payableRewardCount
 *   6. incomeAmount        = payableRewardCount × incomePerReward
 *   7. consumedBV          = rewardCount × bvPerReward
 *      newLeftBV  = leftBV  - consumedBV   (carry-forward unspent BV)
 *      newRightBV = rightBV - consumedBV
 *   8. Credit incomeAmount → withdrawalWallet.
 *   9. Insert BinaryOrbitIncome + WalletTransaction.
 *
 * Each user processed in its own Prisma transaction — one failure is isolated.
 */
export async function processOrbitCycle(
  cycleStart: Date,
  cycleEnd:   Date,
): Promise<{ processed: number; skipped: number; totalIncome: Prisma.Decimal }> {
  // Read settings once per cycle
  const [bvPerReward, maxRewardsPerCycle, incomePerReward, minReferrals] = await Promise.all([
    getNumericSetting(SETTINGS.BV_PER_REWARD,         DEFAULTS.BV_PER_REWARD),
    getNumericSetting(SETTINGS.MAX_REWARDS_PER_CYCLE, DEFAULTS.MAX_REWARDS_PER_CYCLE),
    getNumericSetting(SETTINGS.INCOME_PER_REWARD,     DEFAULTS.INCOME_PER_REWARD),
    getNumericSetting(SETTINGS.MIN_REFERRALS,         DEFAULTS.MIN_REFERRALS),
  ]);

  const decBvPerReward     = new Prisma.Decimal(bvPerReward);
  const decIncomePerReward = new Prisma.Decimal(incomePerReward);

  // Snapshot candidates: ACTIVE users who meet referral gate and have BV on both legs
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

  let processed   = 0;
  let skipped     = 0;
  let totalIncome = new Prisma.Decimal(0);

  for (const user of candidates) {
    const matchedBV  = Prisma.Decimal.min(user.leftBV, user.rightBV);
    const rewardCount = Math.floor(matchedBV.div(decBvPerReward).toNumber());

    if (rewardCount <= 0) {
      skipped++;
      continue;
    }

    const payableRewardCount  = Math.min(rewardCount, maxRewardsPerCycle);
    const destroyedRewardCount = rewardCount - payableRewardCount;
    const incomeAmount        = new Prisma.Decimal(payableRewardCount).times(decIncomePerReward);

    // Consume rewardCount × bvPerReward from each leg (not just payable — all earned rewards consume BV)
    const consumedBV  = new Prisma.Decimal(rewardCount).times(decBvPerReward);
    const newLeftBV   = user.leftBV.minus(consumedBV);
    const newRightBV  = user.rightBV.minus(consumedBV);

    try {
      await prisma.$transaction(async (tx) => {
        // Update user BV balances
        await tx.user.update({
          where: { id: user.id },
          data:  { leftBV: newLeftBV, rightBV: newRightBV },
        });

        // Credit withdrawal wallet
        const wallet = await tx.wallet.update({
          where:  { userId: user.id },
          data:   { withdrawalWallet: { increment: incomeAmount } },
          select: { id: true },
        });

        // BinaryOrbitIncome record
        await tx.binaryOrbitIncome.create({
          data: {
            userId: user.id,
            matchedBV,
            rewardCount,
            destroyedRewardCount,
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
              matchedBV:            matchedBV.toFixed(8),
              rewardCount,
              payableRewardCount,
              destroyedRewardCount,
              consumedBV:           consumedBV.toFixed(8),
              bvPerReward,
              cycleStart,
              cycleEnd,
            },
          },
        });
      });

      totalIncome = totalIncome.plus(incomeAmount);
      processed++;
    } catch {
      skipped++;
    }
  }

  return { processed, skipped, totalIncome };
}

// ── Query: orbit history ──────────────────────────────────────────────────────

const historySelect = {
  id:                   true,
  matchedBV:            true,
  rewardCount:          true,
  destroyedRewardCount: true,
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
        _sum:   { matchedBV: true, incomeAmount: true },
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
      incomeAmount: agg._sum.incomeAmount ?? new Prisma.Decimal(0),
    },
  };
}
