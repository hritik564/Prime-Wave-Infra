import { logger } from "../lib/logger";
import { isWithdrawalEngineEnabled } from "./withdrawal-engine.service";
import { checkHotWalletStatus } from "./withdrawal-hot-wallet.service";
import { getAllGateways } from "../services/blockchain/blockchain.factory";
import { processPendingWithdrawals } from "./withdrawal-processor.service";

// ── In-memory worker state ─────────────────────────────────────────────────────

let workerStarted  = false;
let workerRunning  = false;       // mutex — prevents overlapping runs
let lastPollAt:    Date | null = null;
let lastSuccessAt: Date | null = null;

// ── Public status type ─────────────────────────────────────────────────────────

export interface QueueWorkerStatus {
  started:             boolean;    // worker has been initialised and is polling
  lockHeld:            boolean;    // true while a cycle is executing
  pollIntervalSeconds: number;
  lastPollAt:          string | null;
  lastSuccessAt:       string | null;
}

/** Snapshot of current worker state. Safe to call from any module. */
export function getWorkerStatus(): QueueWorkerStatus {
  return {
    started:             workerStarted,
    lockHeld:            workerRunning,
    pollIntervalSeconds: getPollIntervalSeconds(),
    lastPollAt:          lastPollAt?.toISOString()    ?? null,
    lastSuccessAt:       lastSuccessAt?.toISOString() ?? null,
  };
}

/**
 * Returns true while a processing cycle is actively running.
 * Used by the manual Process Queue endpoint to prevent duplicate runs.
 */
export function isWorkerLocked(): boolean {
  return workerRunning;
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Starts the automatic withdrawal queue worker.
 * Safe to call multiple times — idempotent (no-op after first call).
 * Call once from src/index.ts after the server starts listening.
 */
export async function startWithdrawalAutoWorker(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;

  const intervalSeconds = getPollIntervalSeconds();
  const intervalMs      = intervalSeconds * 1_000;

  const engineOn = await isWithdrawalEngineEnabled().catch(() => false);

  logger.info(
    { intervalSeconds, engineEnabled: engineOn },
    "Withdrawal Auto Worker: started",
  );

  // Fire first poll immediately so eligible withdrawals are not deferred by
  // one full interval after a backend restart.
  void tick();

  setInterval(() => void tick(), intervalMs);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getPollIntervalSeconds(): number {
  const raw = parseInt(process.env["WITHDRAWAL_QUEUE_INTERVAL_SECONDS"] ?? "30", 10);
  return isNaN(raw) || raw < 5 ? 30 : raw;
}

// ── Polling cycle ─────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  // ── Mutex — skip if a previous cycle is still running ────────────────────
  if (workerRunning) {
    logger.info("Withdrawal Queue Poll: skipped — previous cycle still running");
    return;
  }

  workerRunning = true;
  lastPollAt    = new Date();

  try {
    // ── Part 3: Engine awareness ──────────────────────────────────────────────
    const engineOn = await isWithdrawalEngineEnabled();
    if (!engineOn) {
      logger.info("Withdrawal queue skipped: engine paused");
      return;
    }

    // ── Part 4: Blockchain health awareness ───────────────────────────────────
    const gateways = getAllGateways();
    if (gateways.length > 0) {
      const healthChecks = await Promise.allSettled(gateways.map((gw) => gw.getHealth()));
      const anyUnhealthy = healthChecks.some((r) => r.status === "rejected");
      if (anyUnhealthy) {
        logger.info("Withdrawal queue skipped: blockchain unavailable");
        return;
      }
    }

    // ── Part 5: Hot wallet safety ─────────────────────────────────────────────
    const wallet = await checkHotWalletStatus();
    if (wallet.configured && !wallet.isSufficient) {
      logger.info(
        { alerts: wallet.alerts },
        "Withdrawal queue skipped: hot wallet below threshold",
      );
      return;
    }

    // ── Part 7: Delegate to the existing processor (no duplicated logic) ──────
    const result = await processPendingWithdrawals();

    if (result.reason) {
      // processor-internal skip (e.g. engine toggled between our check and batch)
      logger.info({ reason: result.reason }, "Withdrawal Queue Poll: skipped by processor");
    } else if (result.processed > 0 || result.failed > 0) {
      logger.info(
        {
          eligible:  result.processed + result.failed + result.skipped,
          processed: result.processed,
          failed:    result.failed,
        },
        "Withdrawal Queue Poll: processing started",
      );
      lastSuccessAt = new Date();
    } else {
      logger.info("Withdrawal Queue Poll: nothing to process");
      lastSuccessAt = new Date();
    }
  } catch (err) {
    // Part 11: catch, log, release lock, continue polling on next interval
    logger.error({ err }, "Withdrawal Queue Poll: unexpected error — worker continues");
  } finally {
    workerRunning = false;
  }
}
