import { logger } from "../lib/logger";
import { processRoiCycle } from "./roi.engine";
import { runMatchingCycle } from "../binary/matching.engine";
import { runOrbitCycle } from "../binary/orbit.engine";
import { runSalaryCycle } from "../salary";
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

  // ── Monthly salary cron (1st of month, 00:00 London) ──────────────────────
  //
  // IMPORTANT: msUntilNextMonthStart() can return > 24.8 days in ms, which
  // exceeds the 32-bit signed integer limit that Node.js setTimeout uses
  // internally (~2.147 billion ms).  Passing an overflowing value causes
  // Node to set the delay to 1 ms instead — creating an infinite tight loop
  // that floods the connection pool.
  //
  // Fix: cap every setTimeout call to MAX_SALARY_WAIT_MS (12 h). The boundary
  // check at the top of scheduleSalaryCycle is what actually triggers the run,
  // not the timeout alone.  A "last ran" guard keyed to (year, month) prevents
  // double-execution within the same calendar month.
  const MAX_SALARY_WAIT_MS = 12 * 60 * 60 * 1_000; // 12 hours — safely < 2^31

  let lastSalaryYear  = -1;
  let lastSalaryMonth = -1;

  const scheduleSalaryCycle = () => {
    const delayMs = msUntilNextMonthStart();

    if (delayMs <= 1_000) {
      // We have reached (or just passed) the month boundary.
      // Compute which London year+month this boundary belongs to so we can
      // guard against re-running within the same window.
      const fmt   = new Intl.DateTimeFormat("en-GB", {
        timeZone: APP_TIMEZONE, year: "numeric", month: "numeric",
      });
      const parts = fmt.formatToParts(new Date());
      const yr    = Number(parts.find((p) => p.type === "year")?.value  ?? -1);
      const mo    = Number(parts.find((p) => p.type === "month")?.value ?? -1);

      if (yr !== lastSalaryYear || mo !== lastSalaryMonth) {
        lastSalaryYear  = yr;
        lastSalaryMonth = mo;
        void runSalaryMonth();
      }
    }

    // Recompute the delay after a potential run (boundary may have shifted).
    // Clamp so we never pass an overflowing value to setTimeout.
    const nextDelay = msUntilNextMonthStart();
    const safeDelay = Math.min(Math.max(nextDelay, 60_000), MAX_SALARY_WAIT_MS);
    setTimeout(scheduleSalaryCycle, safeDelay);
  };

  const initialSalaryDelay = Math.min(msUntilNextMonthStart(), MAX_SALARY_WAIT_MS);
  const nextSalary          = new Date(Date.now() + initialSalaryDelay);

  logger.info(
    { nextRunAt: nextSalary.toISOString(), timezone: APP_TIMEZONE },
    "Salary scheduler: armed (1st of month)",
  );

  setTimeout(scheduleSalaryCycle, initialSalaryDelay);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  try {
    await processRoiCycle();
  } catch (err) {
    logger.error({ err }, "Scheduler: unhandled error in ROI cycle");
  }

  try {
    await runMatchingCycle();
  } catch (err) {
    logger.error({ err }, "Scheduler: unhandled error in binary matching cycle");
  }

  try {
    await runOrbitCycle();
  } catch (err) {
    logger.error({ err }, "Scheduler: unhandled error in binary orbit cycle");
  }
}

async function runSalaryMonth(): Promise<void> {
  try {
    await runSalaryCycle();
  } catch (err) {
    logger.error({ err }, "Scheduler: unhandled error in salary cron");
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
 * Returns milliseconds until the next 1st-of-month midnight in APP_TIMEZONE
 * (Europe/London). Used to schedule the monthly salary cron.
 *
 * Minimum return value is 1 000 ms to avoid a near-zero delay edge case.
 */
function msUntilNextMonthStart(): number {
  const now    = new Date();
  const london = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    year:     "numeric",
    month:    "numeric",
    day:      "numeric",
    hour:     "2-digit",
    minute:   "2-digit",
    second:   "2-digit",
    hour12:   false,
  });

  const parts  = london.formatToParts(now);
  const get    = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const year   = get("year");
  const month  = get("month"); // 1-based
  const day    = get("day");
  const hour   = get("hour");
  const minute = get("minute");
  const second = get("second");

  if (day === 1 && hour === 0 && minute === 0) {
    // Right at the boundary — fire immediately (1 s delay)
    return 1_000;
  }

  // Compute the UTC timestamp of the next 1st-of-month midnight in London
  // Strategy: increment month, construct midnight, then convert back to UTC.
  let targetYear  = year;
  let targetMonth = month + 1; // move to next month's 1st
  if (targetMonth > 12) { targetMonth = 1; targetYear++; }

  // Build an ISO string that represents midnight on the 1st in London.
  // We approximate using UTC offset — but since we want DST-aware precision,
  // we binary-search the actual UTC instant where London reads 00:00 on the 1st.
  const approxTarget = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0));

  // Adjust for London offset at that approximate instant
  const offsetMs   = londonOffsetMs(approxTarget);
  const targetUtc  = new Date(approxTarget.getTime() - offsetMs);

  return Math.max(targetUtc.getTime() - now.getTime(), 1_000);
}

/**
 * Returns the UTC offset of Europe/London at the given instant (in ms).
 * Positive = London is ahead of UTC (BST summer); negative = behind (not applicable here).
 */
function londonOffsetMs(date: Date): number {
  const utcStr    = date.toLocaleString("en-GB", { timeZone: "UTC" });
  const londonStr = date.toLocaleString("en-GB", { timeZone: APP_TIMEZONE });

  const parse = (s: string): Date => {
    // en-GB format: "DD/MM/YYYY, HH:MM:SS"
    const [datePart, timePart] = s.split(", ");
    const [day, month, year]   = (datePart ?? "").split("/").map(Number);
    const [hour, minute, second] = (timePart ?? "").split(":").map(Number);
    return new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
  };

  return parse(londonStr).getTime() - parse(utcStr).getTime();
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
