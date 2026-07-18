import { logger } from "../lib/logger";
import { runAndSaveReconciliation } from "./reconciliation.service";

// ── Nightly Integrity Scan — Sprint 31F ───────────────────────────────────────
//
// Scheduled daily job that runs the full reconciliation engine, saves the
// report, and logs all detected discrepancies.
//
// NEVER modifies financial data. Read-only scan only.

let scanTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;

export async function runIntegrityScan(triggeredBy?: string): Promise<{
  status:          string;
  discrepancyCount: number;
  durationMs:      number;
}> {
  if (isRunning) {
    logger.warn("integrity-scan: already running — skipping");
    return { status: "SKIPPED_RUNNING", discrepancyCount: 0, durationMs: 0 };
  }

  isRunning = true;
  const start = Date.now();
  logger.info({ triggeredBy }, "integrity-scan: starting");

  try {
    const result = await runAndSaveReconciliation({
      isManual:    !!triggeredBy,
      triggeredBy: triggeredBy ?? "nightly-cron",
    });

    const durationMs = Date.now() - start;

    if (result.discrepancies.length > 0) {
      logger.warn(
        {
          discrepancyCount: result.discrepancies.length,
          durationMs,
          discrepancies: result.discrepancies.map((d) => ({
            type:     d.type,
            severity: d.severity,
          })),
        },
        "integrity-scan: discrepancies detected",
      );
    } else {
      logger.info({ durationMs }, "integrity-scan: all clear — no discrepancies");
    }

    return {
      status:           result.status,
      discrepancyCount: result.discrepancies.length,
      durationMs,
    };
  } catch (err) {
    logger.error({ err }, "integrity-scan: scan failed with error");
    return {
      status:           "ERROR",
      discrepancyCount: 0,
      durationMs:       Date.now() - start,
    };
  } finally {
    isRunning = false;
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

const MAX_SAFE_DELAY = 12 * 60 * 60 * 1_000; // 12 hours (avoids 32-bit overflow)

function scheduleNextScan(targetHour = 3, targetMinute = 0): void {
  const now   = new Date();
  const next  = new Date();
  next.setUTCHours(targetHour, targetMinute, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  const delayMs  = next.getTime() - now.getTime();
  const safeDelay = Math.min(delayMs, MAX_SAFE_DELAY);

  if (scanTimer) clearTimeout(scanTimer);

  scanTimer = setTimeout(async () => {
    // If we capped the delay (>12h), reschedule instead of running early
    if (safeDelay < delayMs) {
      scheduleNextScan(targetHour, targetMinute);
      return;
    }

    await runIntegrityScan("nightly-cron");
    scheduleNextScan(targetHour, targetMinute);
  }, safeDelay);

  logger.info(
    {
      nextRunAt:  next.toISOString(),
      delayHours: (safeDelay / 3_600_000).toFixed(2),
    },
    "integrity-scan: nightly scan scheduled",
  );
}

export function startIntegrityScanScheduler(): void {
  scheduleNextScan(3, 0); // 03:00 UTC daily
  logger.info("integrity-scan: scheduler started (daily at 03:00 UTC)");
}

export function stopIntegrityScanScheduler(): void {
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
    logger.info("integrity-scan: scheduler stopped");
  }
}
