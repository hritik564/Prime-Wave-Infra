import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { processPendingVerifications } from "./deposit-verification.service";
import { verificationMetrics } from "./deposit-verification.metrics";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_POLL_MS = 20_000;
const MIN_POLL_MS     = 1_000;

// ── Worker ────────────────────────────────────────────────────────────────────

let workerStarted = false;

/**
 * Starts the deposit verification polling worker.
 *
 * Safety guarantees:
 *   - H1: Optimistic locking in repo.transition() prevents concurrent workers
 *     from double-processing the same verification row.
 *   - M3: CONFIRMED and CREDITED rows are included in findPendingForWorker;
 *     processOne resumes them after a crash without a re-verification round trip.
 *   - M4: Concurrency limited to deposit_verification.concurrency_limit
 *     (default 10) — safe for shared / rate-limited RPC providers.
 *
 * Configuration keys (system_settings):
 *   deposit_verification.poll_interval_ms   — tick interval, default 20000
 *   deposit_verification.concurrency_limit  — max concurrent checks, default 10
 *   deposit_verification.timeout_ms         — per-verification timeout, default 1800000 (30 min)
 *
 * Call once from src/index.ts after the server starts listening.
 */
export async function startDepositVerificationWorker(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;

  const pollMs = await readPollInterval();

  logger.info(
    { pollIntervalMs: pollMs },
    "DepositVerification worker: armed",
  );

  // Run once immediately to catch any records left from a previous restart
  void tick();

  setInterval(() => void tick(), pollMs);
}

/**
 * Returns the current in-memory metrics snapshot.
 * Resets on server restart. Suitable for admin dashboard polling.
 */
export function getVerificationMetricsSnapshot() {
  return verificationMetrics.getSnapshot();
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const startMs = Date.now();
  try {
    const stats = await processPendingVerifications();
    const durationMs = Date.now() - startMs;

    if (stats.total > 0) {
      logger.info(
        { ...stats, durationMs },
        "DepositVerification worker: tick complete",
      );
      verificationMetrics.recordTick({ ...stats, durationMs });
    }
  } catch (err) {
    logger.error({ err }, "DepositVerification worker: unhandled tick error");
  }
}

async function readPollInterval(): Promise<number> {
  try {
    const setting = await prisma.systemSettings.findUnique({
      where:  { key: "deposit_verification.poll_interval_ms" },
      select: { value: true },
    });
    if (setting) {
      const parsed = Number(setting.value);
      if (!isNaN(parsed) && parsed >= MIN_POLL_MS) return parsed;
    }
  } catch (err) {
    logger.warn({ err }, "DepositVerification worker: could not read poll interval, using default");
  }
  return DEFAULT_POLL_MS;
}
