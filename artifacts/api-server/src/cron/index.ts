import { logger } from "../lib/logger";
import { processRoiCycle } from "./roi.engine";
import { runCombinedBinaryAndOrbitCycle } from "../binary/binary-combined-cycle";
import { processTransferReleases } from "./transfer.engine";
import { APP_TIMEZONE } from "../config/timezone";
import { startWithdrawalConfirmationPoller } from "../withdrawals/withdrawal-confirmation.service";

const CYCLE_MS = 12 * 60 * 60 * 1000; // 12 hours in ms

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Starts the global 12-hour scheduler.
 *
 * Fires at the next 00:00 or 12:00 in Europe/London time (BST/GMT aware),
 * then every 12 hours from that point.
 *
 * Each cycle runs in series:
 *  1. ROI engine      — compounds/accrues ROI for all ACTIVE investments
 *  2. Binary matching — pays matching income to all qualified users
 *  3. Binary orbit    — pays orbit income to all qualified users
 *
 * Series ordering ensures matching runs before orbit; both run after ROI has
 * accrued for the cycle.
 *
 * Safe to call multiple times — idempotent.
 */
let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  // ── 12-hour cycle (ROI + matching + orbit) ─────────────────────────────────
  const delayMs = msUntilNextLondonBoundary();
  const nextRun = new Date(Date.now() + delayMs);

  logger.info(
    { nextRunAt: nextRun.toISOString(), timezone: APP_TIMEZONE },
    "Scheduler: armed (ROI + binary matching + binary orbit)",
  );

  setTimeout(() => {
    void runCycle();
    setInterval(() => void runCycle(), CYCLE_MS);
  }, delayMs);

  // ── Hourly income-transfer release engine ─────────────────────────────────
  // Runs immediately (to catch any missed releases from a restart) then every
  // 60 minutes thereafter.  Safe: the engine checks nextReleaseAt <= now before
  // processing, so duplicate runs within a minute window are harmless.
  void runTransferReleases();
  setInterval(() => void runTransferReleases(), 60 * 60 * 1000);

  // ── Withdrawal confirmation poller ─────────────────────────────────────────
  // Polls every 30 seconds for CONFIRMING withdrawals and advances them to
  // COMPLETED once BSC_CONFIRMATIONS_REQUIRED is met.
  startWithdrawalConfirmationPoller();

}

// ── Internal ──────────────────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  try {
    await processRoiCycle();
  } catch (err) {
    logger.error({ err }, "Scheduler: unhandled error in ROI cycle");
  }

  // Combined binary cycle — matching + orbit in one pass per user so that
  // matching cannot deplete the BV pool before orbit reads it.
  try {
    const cycleEnd   = new Date();
    const cycleStart = new Date(cycleEnd.getTime() - 12 * 60 * 60 * 1_000);
    const result     = await runCombinedBinaryAndOrbitCycle(cycleStart, cycleEnd);
    logger.info(
      {
        matchingProcessed:   result.matchingProcessed,
        matchingSkipped:     result.matchingSkipped,
        orbitProcessed:      result.orbitProcessed,
        orbitSkipped:        result.orbitSkipped,
        totalMatchingIncome: result.totalMatchingIncome.toFixed(2),
        totalOrbitIncome:    result.totalOrbitIncome.toFixed(2),
        totalMatchedBV:      result.totalMatchedBV.toFixed(2),
        totalFlushedBV:      result.totalFlushedBV.toFixed(2),
        cycleStart,
        cycleEnd,
      },
      "Combined binary cycle: complete",
    );
  } catch (err) {
    logger.error({ err }, "Scheduler: unhandled error in combined binary cycle");
  }
}

async function runTransferReleases(): Promise<void> {
  try {
    await processTransferReleases();
  } catch (err) {
    logger.error({ err }, "Scheduler: unhandled error in transfer release engine");
  }
}

/**
 * Returns milliseconds until the next 00:00 or 12:00 boundary in APP_TIMEZONE
 * (Europe/London), automatically accounting for BST/GMT transitions.
 *
 * Strategy: use Intl.DateTimeFormat to read the current London clock, then
 * compute how many seconds remain until the next half-day boundary.
 * This is correct across DST transitions because Intl owns the offset.
 *
 * Minimum return value is 1 000 ms to avoid a near-zero delay edge case.
 */
function msUntilNextLondonBoundary(): number {
  const now = new Date();

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour:     "2-digit",
    minute:   "2-digit",
    second:   "2-digit",
    hour12:   false,
  });

  const parts = fmt.formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const londonHour   = get("hour");
  const londonMinute = get("minute");
  const londonSecond = get("second");

  const secondsIntoDay = londonHour * 3_600 + londonMinute * 60 + londonSecond;

  // Before noon → next boundary is 12:00:00 London (43 200 s into the day)
  // Noon or after → next boundary is 00:00:00 London tomorrow (86 400 s into the day)
  const secondsUntilBoundary =
    londonHour < 12
      ? 12 * 3_600 - secondsIntoDay
      : 24 * 3_600 - secondsIntoDay;

  return Math.max(secondsUntilBoundary * 1_000, 1_000);
}
