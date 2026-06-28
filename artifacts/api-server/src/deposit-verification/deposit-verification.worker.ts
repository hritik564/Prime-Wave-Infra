import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { processPendingVerifications } from "./deposit-verification.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_POLL_MS = 20_000;
const MIN_POLL_MS     = 1_000;

// ── Worker ────────────────────────────────────────────────────────────────────

let workerStarted = false;

/**
 * Starts the deposit verification polling worker.
 *
 * - DB-driven: queries verificationStatus IN (TX_SUBMITTED, VERIFYING,
 *   WAITING_CONFIRMATIONS) AND nextCheckAt <= NOW() on every tick.
 * - Restart-safe: no in-memory job state; picks up from DB on every boot.
 * - Interval is read from system_settings at startup; change the DB value
 *   to retune without a code deployment.
 *
 * Call once from src/index.ts after server starts listening.
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

// ── Internal ──────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    const processed = await processPendingVerifications();
    if (processed > 0) {
      logger.info({ processed }, "DepositVerification worker: tick complete");
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
