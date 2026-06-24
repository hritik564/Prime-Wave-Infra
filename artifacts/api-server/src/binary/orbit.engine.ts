import { logger } from "../lib/logger";
import { processOrbitCycle } from "./orbit.service";

const HALF_DAY_MS = 12 * 60 * 60 * 1_000;

/**
 * Entry point for the cron scheduler.
 * Computes cycleStart/cycleEnd boundaries, then delegates to processOrbitCycle.
 */
export async function runOrbitCycle(): Promise<void> {
  const cycleEnd   = new Date();
  const cycleStart = new Date(cycleEnd.getTime() - HALF_DAY_MS);

  logger.info({ cycleStart, cycleEnd }, "Binary orbit cycle: starting");

  try {
    const result = await processOrbitCycle(cycleStart, cycleEnd);

    logger.info(
      {
        processed:   result.processed,
        skipped:     result.skipped,
        totalIncome: result.totalIncome.toFixed(8),
        cycleStart,
        cycleEnd,
      },
      "Binary orbit cycle: complete",
    );
  } catch (err) {
    logger.error({ err, cycleStart, cycleEnd }, "Binary orbit cycle: unhandled error");
  }
}
