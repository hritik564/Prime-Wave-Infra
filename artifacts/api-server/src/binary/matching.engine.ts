import { logger } from "../lib/logger";
import { processMatchingCycle } from "./matching.service";
import type { MatchingCycleResult } from "./matching.service";

const HALF_DAY_MS = 12 * 60 * 60 * 1_000;

/**
 * Entry point for the cron scheduler.
 * Computes cycleStart/cycleEnd boundaries, then delegates to processMatchingCycle.
 */
export async function runMatchingCycle(): Promise<MatchingCycleResult | undefined> {
  const cycleEnd   = new Date();
  const cycleStart = new Date(cycleEnd.getTime() - HALF_DAY_MS);
  const startedAt  = Date.now();

  logger.info({ cycleStart, cycleEnd }, "Binary matching cycle: starting");

  try {
    const result          = await processMatchingCycle(cycleStart, cycleEnd);
    const executionTimeMs = Date.now() - startedAt;

    logger.info(
      {
        processed:          result.processed,
        skipped:            result.skipped,
        failedCount:        result.failedUsers.length,
        failedUsers:        result.failedUsers.map((f) => ({
          userId:         f.userId,
          username:       f.username,
          matchedBV:      f.matchedBV,
          expectedIncome: f.expectedIncome,
          error:          f.error,
          timestamp:      f.timestamp,
        })),
        totalIncome:        result.totalIncome.toFixed(2),
        totalMatchedBV:     result.totalMatchedBV.toFixed(2),
        totalRewardedBV:    result.totalRewardedBV.toFixed(2),
        totalFlushedBV:     result.totalFlushedBV.toFixed(2),
        totalCarryFwdLeft:  result.totalCarryFwdLeft.toFixed(2),
        totalCarryFwdRight: result.totalCarryFwdRight.toFixed(2),
        executionTimeMs,
        cycleStart,
        cycleEnd,
      },
      "Binary matching cycle: complete",
    );

    return result;
  } catch (err) {
    logger.error({ err, cycleStart, cycleEnd }, "Binary matching cycle: unhandled error");
    return undefined;
  }
}
