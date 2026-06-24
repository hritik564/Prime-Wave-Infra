import { logger } from "../lib/logger";
import { processRoiCycle } from "./roi.engine";

const CYCLE_MS = 12 * 60 * 60 * 1000; // 12 hours

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Starts the global ROI scheduler.
 * Fires at the next 00:00 or 12:00 UTC boundary, then every 12 hours.
 * Safe to call multiple times — only starts one timer.
 */
let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  const delayMs = msUntilNext12hBoundary();
  const nextRun = new Date(Date.now() + delayMs);

  logger.info({ nextRunAt: nextRun.toISOString() }, "ROI scheduler: armed");

  setTimeout(() => {
    void runCycle();
    setInterval(() => void runCycle(), CYCLE_MS);
  }, delayMs);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  try {
    await processRoiCycle();
  } catch (err) {
    logger.error({ err }, "ROI scheduler: unhandled error in cycle");
  }
}

/**
 * Returns milliseconds until the next 00:00 or 12:00 UTC,
 * with a 1-second minimum to avoid a near-zero delay edge case.
 */
function msUntilNext12hBoundary(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);

  const h = now.getUTCHours();
  if (h < 12) {
    next.setUTCHours(12);
  } else {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0);
  }

  return Math.max(next.getTime() - now.getTime(), 1_000);
}
