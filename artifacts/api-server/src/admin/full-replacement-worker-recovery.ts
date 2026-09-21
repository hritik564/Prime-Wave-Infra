import type { PrismaClient } from "@prisma/client";
import { logger } from "../lib/logger";
import { FULL_REPLACEMENT_PASSWORD_RESET_LOCK_KEY } from "./common-password-reset.service";

export const FULL_REPLACEMENT_WORKER_EXIT_FAILURE_REASON =
  "Full replacement worker exited before terminal completion; resume from the last durable checkpoint";

type WorkerRecoveryDb = Pick<
  PrismaClient,
  "commonTemporaryPasswordResetRun" | "adminLog"
>;

function safeErrorShape(error: unknown): { type: string; code: string | null } {
  const type =
    error instanceof Error && /^([A-Za-z][A-Za-z0-9_.-]{0,63})$/.test(error.name)
      ? error.name
      : "WorkerRecoveryError";
  const rawCode =
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
      ? error.code
      : null;
  const code = rawCode && /^[A-Z][A-Z0-9_:-]{0,31}$/.test(rawCode) ? rawCode : null;
  return { type, code };
}

/**
 * Fails a FULL_REPLACEMENT worker only when its durable row still proves that
 * this worker owned the active lock. If the database is unavailable, this
 * deliberately leaves the lease in place for the normal stale-run recovery.
 */
export async function recoverUnexpectedFullReplacementWorkerExit(
  db: WorkerRecoveryDb,
  runId: string,
): Promise<void> {
  try {
    const run = await db.commonTemporaryPasswordResetRun.findUnique({
      where: { id: runId },
      select: {
        adminId: true,
        operationType: true,
        status: true,
        processedCount: true,
        totalEligible: true,
        activeLockKey: true,
      },
    });

    if (
      !run
      || run.operationType !== "FULL_REPLACEMENT"
      || run.status !== "RUNNING"
      || run.activeLockKey !== FULL_REPLACEMENT_PASSWORD_RESET_LOCK_KEY
    ) {
      return;
    }

    const transition = await db.commonTemporaryPasswordResetRun.updateMany({
      where: {
        id: runId,
        operationType: "FULL_REPLACEMENT",
        status: "RUNNING",
        activeLockKey: FULL_REPLACEMENT_PASSWORD_RESET_LOCK_KEY,
      },
      data: {
        status: "FAILED",
        failedCount: 1,
        failureReason: FULL_REPLACEMENT_WORKER_EXIT_FAILURE_REASON,
        activeLockKey: null,
        workerLeaseUntil: null,
      },
    });

    if (transition.count !== 1) return;

    await db.adminLog.create({
      data: {
        adminId: run.adminId,
        action: "FULL_REPLACEMENT_PASSWORD_RESET_FAILED",
        details: {
          runId,
          operationType: "FULL_REPLACEMENT",
          processedCount: run.processedCount,
          targetCount: run.totalEligible,
          failedCount: 1,
          diagnostic: {
            type: "WorkerProcessExit",
            code: "WORKER_EXITED",
            message: FULL_REPLACEMENT_WORKER_EXIT_FAILURE_REASON,
          },
        },
      },
    }).catch((error: unknown) => {
      const safe = safeErrorShape(error);
      logger.warn(
        { runId, errorType: safe.type, errorCode: safe.code },
        "Full replacement worker exit audit could not be written",
      );
    });
  } catch (error) {
    const safe = safeErrorShape(error);
    logger.warn(
      { runId, errorType: safe.type, errorCode: safe.code },
      "Full replacement worker exit recovery deferred to lease recovery",
    );
  }
}