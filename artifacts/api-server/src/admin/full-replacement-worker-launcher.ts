import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../lib/logger";

export const FULL_REPLACEMENT_WORKER_CONNECTION_LIMIT = 2;
export const FULL_REPLACEMENT_WORKER_POOL_TIMEOUT_SECONDS = 60;
export const FULL_REPLACEMENT_WORKER_CONNECT_TIMEOUT_SECONDS = 15;

type FullReplacementWorkerMessage = {
  runId: string;
  adminId: string;
  password: string;
};

const activeWorkers = new Map<string, ChildProcess>();

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
  if (activeWorkers.has(runId)) {
    logger.warn({ runId }, "Full replacement worker already exists; duplicate launch skipped");
    return;
  }

  const dedicatedDatabaseUrl = getDedicatedDatabaseUrl();
  if (!dedicatedDatabaseUrl) {
    logger.error(
      { runId },
      "Full replacement worker could not start because DATABASE_URL is unavailable",
    );
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
    logger.error(
      {
        runId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Full replacement worker process could not be spawned",
    );
    return;
  }

  activeWorkers.set(runId, child);

  child.once("error", (error) => {
    logger.error(
      { runId, error: error.message },
      "Full replacement worker process reported an error",
    );
  });

  child.once("exit", (code, signal) => {
    activeWorkers.delete(runId);
    if (code !== 0 || signal !== null) {
      logger.error(
        { runId, code, signal },
        "Full replacement worker process exited before a clean shutdown",
      );
    }
  });

  const message: FullReplacementWorkerMessage = { runId, adminId, password };
  child.send(message, (error) => {
    if (error) {
      logger.error(
        { runId, error: error.message },
        "Full replacement worker could not receive its start message",
      );
    }
  });
}