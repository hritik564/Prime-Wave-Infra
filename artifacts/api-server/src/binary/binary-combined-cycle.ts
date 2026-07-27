/**
 * Combined Binary Cycle — matching + orbit in one pass per user.
 *
 * Problem this solves:
 *   When matching and orbit run sequentially (matching first), matching flushes
 *   ALL matched BV (organic + power) from both legs.  By the time orbit runs,
 *   the right leg is at zero → orbit finds no candidates → no orbit income.
 *
 * Solution:
 *   Read every qualifying user's BV ONCE (the pre-cycle snapshot), compute
 *   both matching income and orbit income against that snapshot, then commit
 *   a SINGLE BV flush + both income credits in one Prisma transaction per user.
 *   Neither engine can deplete the BV before the other reads it.
 */

import { Prisma } from "@prisma/client";
import { prisma }               from "../config/prisma";
import { computeBVFlush }       from "./bv-flush";
import { getNumericSetting }    from "../config/settings";
import { notificationService }  from "../notifications/notifications.service";
import { writeLedgerEntry }     from "../ledger/ledger.service";
import { logger }               from "../lib/logger";

// ── Matching constants (same as matching.service.ts) ─────────────────────────
const MATCHING_INCOME_PER_BV  = new Prisma.Decimal("5");
const MATCHING_MAX_PAYABLE_BV = new Prisma.Decimal("50");

// ── Orbit settings keys (same as orbit.service.ts) ───────────────────────────
const ORBIT_SETTINGS = {
  BV_PER_REWARD:         "orbit.bv_per_reward",
  MAX_REWARDS_PER_CYCLE: "orbit.max_rewards_per_cycle",
  INCOME_PER_REWARD:     "orbit.income_per_reward",
} as const;
const ORBIT_DEFAULTS = {
  BV_PER_REWARD:         150,
  MAX_REWARDS_PER_CYCLE: 1,
  INCOME_PER_REWARD:     500,
} as const;

export interface CombinedCycleResult {
  matchingProcessed:  number;
  matchingSkipped:    number;
  orbitProcessed:     number;
  orbitSkipped:       number;
  totalMatchingIncome: Prisma.Decimal;
  totalOrbitIncome:    Prisma.Decimal;
  totalMatchedBV:      Prisma.Decimal;
  totalFlushedBV:      Prisma.Decimal;
}

/**
 * Runs binary matching + binary orbit in a single pass.
 * Called by the cron scheduler instead of the two separate engine functions.
 */
export async function runCombinedBinaryAndOrbitCycle(
  cycleStart: Date,
  cycleEnd:   Date,
): Promise<CombinedCycleResult> {
  // Load orbit settings
  const [bvPerReward, maxRewardsPerCycle, incomePerReward] = await Promise.all([
    getNumericSetting(ORBIT_SETTINGS.BV_PER_REWARD,         ORBIT_DEFAULTS.BV_PER_REWARD),
    getNumericSetting(ORBIT_SETTINGS.MAX_REWARDS_PER_CYCLE, ORBIT_DEFAULTS.MAX_REWARDS_PER_CYCLE),
    getNumericSetting(ORBIT_SETTINGS.INCOME_PER_REWARD,     ORBIT_DEFAULTS.INCOME_PER_REWARD),
  ]);
  const decBvPerReward     = new Prisma.Decimal(bvPerReward);
  const decIncomePerReward = new Prisma.Decimal(incomePerReward);

  // ── Single candidate query — read BV snapshot BEFORE either engine writes ──
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
      AND: [
        { OR: [{ leftBV: { gt: 0 } }, { powerLeftBV: { gt: 0 } }] },
        { OR: [{ rightBV: { gt: 0 } }, { powerRightBV: { gt: 0 } }] },
      ],
    },
    select: {
      id:           true,
      username:     true,
      leftBV:       true,
      rightBV:      true,
      powerLeftBV:  true,
      powerRightBV: true,
    },
    orderBy: { id: "asc" },
  });

  let matchingProcessed  = 0;
  let matchingSkipped    = 0;
  let orbitProcessed     = 0;
  let orbitSkipped       = 0;
  let totalMatchingIncome = new Prisma.Decimal(0);
  let totalOrbitIncome    = new Prisma.Decimal(0);
  let totalMatchedBV      = new Prisma.Decimal(0);
  let totalFlushedBV      = new Prisma.Decimal(0);

  for (const user of candidates) {
    // ── Compute flush from PRE-CYCLE snapshot (same for both engines) ─────────
    const flush = computeBVFlush(
      { organicBV: user.leftBV,  powerBV: user.powerLeftBV },
      { organicBV: user.rightBV, powerBV: user.powerRightBV },
    );
    const {
      matchedBV,
      organicLeftConsumed,  powerLeftConsumed,
      organicRightConsumed, powerRightConsumed,
      carryForwardLeft,     carryForwardRight,
      powerCarryForwardLeft, powerCarryForwardRight,
    } = flush;

    if (matchedBV.lte(0)) {
      matchingSkipped++;
      orbitSkipped++;
      continue;
    }

    // ── Matching computation ─────────────────────────────────────────────────
    const matchingRewardedBV  = Prisma.Decimal.min(matchedBV, MATCHING_MAX_PAYABLE_BV);
    const matchingDestroyedBV = matchedBV.minus(matchingRewardedBV);
    const matchingIncome      = matchingRewardedBV.times(MATCHING_INCOME_PER_BV);
    const flushedBV           = matchedBV; // ALL matched BV flushed

    // ── Orbit computation ────────────────────────────────────────────────────
    const rewardCount          = Math.floor(matchedBV.div(decBvPerReward).toNumber());
    const payableRewardCount   = Math.min(rewardCount, maxRewardsPerCycle);
    const destroyedRewardCount = rewardCount - payableRewardCount;
    const orbitIncome          = new Prisma.Decimal(payableRewardCount).times(decIncomePerReward);

    const willCredit  = matchingRewardedBV.gt(0) || payableRewardCount > 0;
    const totalCredit = matchingIncome.plus(orbitIncome);

    try {
      await prisma.$transaction(async (tx) => {
        // ── Single BV flush — applies pre-cycle carry-forwards ───────────────
        await tx.user.update({
          where: { id: user.id },
          data:  {
            leftBV:       carryForwardLeft,
            rightBV:      carryForwardRight,
            powerLeftBV:  powerCarryForwardLeft,
            powerRightBV: powerCarryForwardRight,
          },
        });

        // ── Wallet credit — combined income in one increment ─────────────────
        const wallet = await tx.wallet.update({
          where:  { userId: user.id },
          data:   { withdrawalWallet: { increment: totalCredit } },
          select: { id: true, withdrawalWallet: true },
        });

        // ── Binary matching records ──────────────────────────────────────────
        if (matchingRewardedBV.gt(0)) {
          await tx.binaryMatchIncome.create({
            data: {
              userId:           user.id,
              matchedBV,
              payableBV:        matchingRewardedBV,
              destroyedBV:      matchingDestroyedBV,
              flushedBV,
              carryForwardLeft,
              carryForwardRight,
              incomeAmount:     matchingIncome,
              cycleStart,
              cycleEnd,
            },
          });

          await tx.walletTransaction.create({
            data: {
              walletId:    wallet.id,
              userId:      user.id,
              type:        "BINARY_MATCH",
              status:      "SUCCESS",
              amount:      matchingIncome,
              description: `Binary matching income — ${matchingRewardedBV.toFixed(0)} rewarded BV × $5 (cycle ${cycleStart.toISOString()})`,
              metadata: {
                matchedBV:            matchedBV.toFixed(8),
                rewardedBV:           matchingRewardedBV.toFixed(8),
                flushedBV:            flushedBV.toFixed(8),
                carryForwardLeft:     carryForwardLeft.toFixed(8),
                carryForwardRight:    carryForwardRight.toFixed(8),
                organicLeftConsumed:  organicLeftConsumed.toFixed(8),
                organicRightConsumed: organicRightConsumed.toFixed(8),
                powerLeftConsumed:    powerLeftConsumed.toFixed(8),
                powerRightConsumed:   powerRightConsumed.toFixed(8),
                cycleStart,
                cycleEnd,
              },
            },
          });
        }

        // ── Binary orbit records ─────────────────────────────────────────────
        if (payableRewardCount > 0) {
          await tx.binaryOrbitIncome.create({
            data: {
              userId:              user.id,
              matchedBV,
              rewardCount,
              destroyedRewardCount,
              flushedBV,
              carryForwardLeft,
              carryForwardRight,
              incomeAmount: orbitIncome,
              cycleStart,
              cycleEnd,
            },
          });

          await tx.walletTransaction.create({
            data: {
              walletId:    wallet.id,
              userId:      user.id,
              type:        "BINARY_ORBIT",
              status:      "SUCCESS",
              amount:      orbitIncome,
              description: `Binary orbit income — ${payableRewardCount} orbit × $${incomePerReward} (cycle ${cycleStart.toISOString()})`,
              metadata: {
                matchedBV:            matchedBV.toFixed(8),
                rewardCount,
                payableRewardCount,
                destroyedRewardCount,
                flushedBV:            flushedBV.toFixed(8),
                carryForwardLeft:     carryForwardLeft.toFixed(8),
                carryForwardRight:    carryForwardRight.toFixed(8),
                organicLeftConsumed:  organicLeftConsumed.toFixed(8),
                organicRightConsumed: organicRightConsumed.toFixed(8),
                powerLeftConsumed:    powerLeftConsumed.toFixed(8),
                powerRightConsumed:   powerRightConsumed.toFixed(8),
                bvPerReward,
                cycleStart,
                cycleEnd,
              },
            },
          });
        }
      });

      // ── Post-transaction: ledger + notifications (fire-and-forget) ──────────
      if (willCredit) {
        void prisma.wallet
          .findUnique({ where: { userId: user.id }, select: { withdrawalWallet: true } })
          .then(w => {
            if (!w) return;
            if (matchingRewardedBV.gt(0)) {
              void writeLedgerEntry({
                referenceId:     user.id,
                referenceType:   "binary_match",
                memberId:        user.id,
                username:        user.username,
                transactionType: "MATCHING_BONUS",
                amount:          matchingIncome,
                debitCredit:     "CREDIT",
                walletType:      "WITHDRAWAL_WALLET",
                closingBalance:  w.withdrawalWallet,
                metadata:        { matchedBV: matchedBV.toFixed(8), rewardedBV: matchingRewardedBV.toFixed(8), cycleStart, cycleEnd },
              });
            }
            if (payableRewardCount > 0) {
              void writeLedgerEntry({
                referenceId:     user.id,
                referenceType:   "binary_orbit",
                memberId:        user.id,
                username:        user.id,
                transactionType: "ORBIT_INCOME",
                amount:          orbitIncome,
                debitCredit:     "CREDIT",
                walletType:      "WITHDRAWAL_WALLET",
                closingBalance:  w.withdrawalWallet,
                metadata:        { matchedBV: matchedBV.toFixed(8), rewardCount, payableRewardCount, cycleStart, cycleEnd },
              });
            }
          })
          .catch(err => logger.error({ err }, "ledger: combined binary cycle write failed"));

        if (matchingRewardedBV.gt(0)) {
          void notificationService.create({
            userId:  user.id,
            type:    "BINARY_MATCH_INCOME",
            title:   "Binary Matching Complete",
            message: [
              `Matched BV: ${matchedBV.toFixed(2)}`,
              `Rewarded BV: ${matchingRewardedBV.toFixed(2)}`,
              `Income Credited: $${matchingIncome.toFixed(2)}`,
              `Carry Forward Left: ${carryForwardLeft.toFixed(2)}`,
              `Carry Forward Right: ${carryForwardRight.toFixed(2)}`,
            ].join("\n"),
            metadata: {
              matchedBV:         matchedBV.toString(),
              rewardedBV:        matchingRewardedBV.toString(),
              flushedBV:         flushedBV.toString(),
              carryForwardLeft:  carryForwardLeft.toString(),
              carryForwardRight: carryForwardRight.toString(),
              incomeAmount:      matchingIncome.toString(),
            },
          });
        }

        if (payableRewardCount > 0) {
          void notificationService.create({
            userId:  user.id,
            type:    "BINARY_ORBIT_INCOME",
            title:   "Binary Orbit Complete",
            message: [
              `Matched BV: ${matchedBV.toFixed(2)}`,
              `Reward: $${orbitIncome.toFixed(2)}`,
              `Flushed BV: ${flushedBV.toFixed(2)}`,
              `Carry Forward Left: ${carryForwardLeft.toFixed(2)}`,
              `Carry Forward Right: ${carryForwardRight.toFixed(2)}`,
            ].join("\n"),
            metadata: {
              matchedBV:         matchedBV.toString(),
              flushedBV:         flushedBV.toString(),
              carryForwardLeft:  carryForwardLeft.toString(),
              carryForwardRight: carryForwardRight.toString(),
              incomeAmount:      orbitIncome.toString(),
              rewardCount,
              payableRewardCount,
            },
          });
        }
      }

      if (matchingRewardedBV.gt(0)) { matchingProcessed++; totalMatchingIncome = totalMatchingIncome.plus(matchingIncome); }
      else matchingSkipped++;
      if (payableRewardCount > 0)   { orbitProcessed++;    totalOrbitIncome    = totalOrbitIncome.plus(orbitIncome); }
      else orbitSkipped++;

      totalMatchedBV  = totalMatchedBV.plus(matchedBV);
      totalFlushedBV  = totalFlushedBV.plus(flushedBV);

    } catch (err) {
      logger.error(
        { err, userId: user.id, username: user.username, matchedBV: matchedBV.toFixed(8) },
        "Combined binary cycle: user processing failed — skipping, continuing cycle",
      );
      matchingSkipped++;
      orbitSkipped++;
    }
  }

  return {
    matchingProcessed,
    matchingSkipped,
    orbitProcessed,
    orbitSkipped,
    totalMatchingIncome,
    totalOrbitIncome,
    totalMatchedBV,
    totalFlushedBV,
  };
}
