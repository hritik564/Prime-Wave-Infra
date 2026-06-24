import { logger } from "../lib/logger";
import { processMatchingCycle } from "./matching.service";

const HALF_DAY_MS = 12 * 60 * 60 * 1_000;

/**
 * Entry point for the cron scheduler.
 * Computes cycleStart/cycleEnd boundaries, then delegates to processMatchingCycle.
 */
export async function runMatchingCycle(): Promise<void> {
  const cycleEnd   = new Date();
  const cycleStart = new Date(cycleEnd.getTime() - HALF_DAY_MS);

  logger.info({ cycleStart, cycleEnd }, "Binary matching cycle: starting");

  try {
    const result = await processMatchingCycle(cycleStart, cycleEnd);

    logger.info(
      {
        processed:   result.processed,
        skipped:     result.skipped,
        totalIncome: result.totalIncome.toFixed(8),
        cycleStart,
        cycleEnd,
      },
      "Binary matching cycle: complete",
    );
  } catch (err) {
    logger.error({ err, cycleStart, cycleEnd }, "Binary matching cycle: unhandled error");
  }
}
