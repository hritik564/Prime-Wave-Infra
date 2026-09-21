import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { recoverUnexpectedFullReplacementWorkerExit } from "./full-replacement-worker-recovery";

export const FULL_REPLACEMENT_WORKER_CONNECTION_LIMIT = 2;
export const FULL_REPLACEMENT_WORKER_POOL_TIMEOUT_SECONDS = 60;
export const FULL_REPLACEMENT_WORKER_CONNECT_TIMEOUT_SECONDS = 15;

type FullReplacementWorkerMessage = {
  runId: string;
  adminId: string;
  password: string;
};

const activeWorkers = new Map<string, ChildProcess>();

export function hasActiveFullReplacementWorker(): boolean {
  return activeWorkers.size > 0;
}

function safeErrorShape(error: unknown): { type: string; code: string | null } {
  const knownTypes = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "SyntaxError",
    "ReferenceError",
    "AggregateError",
    "PrismaClientKnownRequestError",
    "PrismaClientUnknownRequestError",
    "PrismaClientValidationError",
  ]);
  const type =
    error instanceof Error && knownTypes.has(error.name)
      ? error.name
      : "WorkerProcessError";
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

export type FullReplacementWorkerIpcChild = Pick<ChildProcess, "send">;

export function sendFullReplacementWorkerMessage(
  child: FullReplacementWorkerIpcChild,
  message: FullReplacementWorkerMessage,
  onFailure: () => void,
): void {
  const handleFailure = (error: unknown): void => {
    const safe = safeErrorShape(error);
    logger.error(
      { runId: message.runId, errorType: safe.type, errorCode: safe.code },
      "Full replacement worker could not receive its start message",
    );
    onFailure();
  };

  try {
    child.send(message, (error) => {
      if (error) handleFailure(error);
    });
  } catch (error) {
    handleFailure(error);
  }
}

function deferWorkerFailureRecovery(runId: string): void {
  void recoverUnexpectedFullReplacementWorkerExit(prisma, runId);
}

function setConnectionParameter(url: string, key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`([?&])${escapedKey}=[^&#]*`);
  if (pattern.test(url)) {
    return url.replace(pattern, `$1${key}=${encodeURIComponent(value)}`);
  }
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function getDedicatedDatabaseUrl(): string | null {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) return null;

  let dedicatedUrl = databaseUrl;
  dedicatedUrl = setConnectionParameter(
    dedicatedUrl,
    "connection_limit",
    String(FULL_REPLACEMENT_WORKER_CONNECTION_LIMIT),
  );
  dedicatedUrl = setConnectionParameter(
    dedicatedUrl,
    "pool_timeout",
    String(FULL_REPLACEMENT_WORKER_POOL_TIMEOUT_SECONDS),
  );
  dedicatedUrl = setConnectionParameter(
    dedicatedUrl,
    "connect_timeout",
    String(FULL_REPLACEMENT_WORKER_CONNECT_TIMEOUT_SECONDS),
  );
  return dedicatedUrl;
}

function workerEntryPath(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "full-replacement-worker.mjs",
  );
}

/**
 * Starts the only process-level isolated worker used by FULL_REPLACEMENT.
 *
 * The password is sent through the private parent/child IPC channel and is
 * never placed in argv, environment variables, logs, or a database row.
 */
export function launchFullReplacementWorker(
  runId: string,
  adminId: string,
  password: string,
): void {
  if (activeWorkers.size > 0) {
    logger.warn(
      { runId, duplicateRun: activeWorkers.has(runId) },
      "Full replacement worker launch skipped while another worker is active",
    );
    if (!activeWorkers.has(runId)) {
      deferWorkerFailureRecovery(runId);
    }
    return;
  }

  const dedicatedDatabaseUrl = getDedicatedDatabaseUrl();
  if (!dedicatedDatabaseUrl) {
    logger.error(
      { runId },
      "Full replacement worker could not start because DATABASE_URL is unavailable",
    );
    deferWorkerFailureRecovery(runId);
    return;
  }

  let child: ChildProcess;
  try {
    child = fork(workerEntryPath(), [], {
      env: {
        ...process.env,
        DATABASE_URL: dedicatedDatabaseUrl,
        FULL_REPLACEMENT_WORKER: "1",
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
  } catch (error) {
    const safe = safeErrorShape(error);
    logger.error(
      {
        runId,
        errorType: safe.type,
        errorCode: safe.code,
      },
      "Full replacement worker process could not be spawned",
    );
    deferWorkerFailureRecovery(runId);
    return;
  }

  activeWorkers.set(runId, child);

  child.once("error", (error) => {
    const safe = safeErrorShape(error);
    logger.error(
      { runId, errorType: safe.type, errorCode: safe.code },
      "Full replacement worker process reported an error",
    );
  });

  child.once("exit", (code, signal) => {
    if (code !== 0 || signal !== null) {
      logger.error(
        { runId, code, signal },
        "Full replacement worker process exited before a clean shutdown",
      );
    }
    void recoverUnexpectedFullReplacementWorkerExit(prisma, runId)
      .finally(() => {
        activeWorkers.delete(runId);
      });
  });

  const message: FullReplacementWorkerMessage = { runId, adminId, password };
  sendFullReplacementWorkerMessage(child, message, () => {
    deferWorkerFailureRecovery(runId);
  });
}