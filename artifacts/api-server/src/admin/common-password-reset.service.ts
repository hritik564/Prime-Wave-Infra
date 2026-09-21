import bcrypt from "bcryptjs";
import type {
  BulkPasswordResetRunStatus,
  CommonTemporaryPasswordResetRunStatus,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { logger } from "../lib/logger";
import {
  COMMON_PASSWORD_RESET_CONFIRMATION,
  COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID,
  type CommonPasswordResetExecuteInput,
} from "./common-password-reset.schema";

export const COMMON_PASSWORD_RESET_BATCH_SIZE = 250;
export const COMMON_PASSWORD_RESET_BCRYPT_CONCURRENCY = 4;
export const COMMON_PASSWORD_RESET_WORKER_LEASE_MS = 15 * 60_000;
export const COMMON_PASSWORD_RESET_HEARTBEAT_INTERVAL_MS = 60_000;
export const COMMON_PASSWORD_RESET_LOCK_KEY = "COMMON_TEMPORARY_PASSWORD_RESET";
export const COMMON_PASSWORD_RESET_EMERGENCY_STOP_REASON =
  "WORKER_ADMIN_STOPPED_FOR_PERFORMANCE_RECOVERY";
export const COMMON_PASSWORD_RESET_WORKER_PROCESS_LOST_REASON =
  "COMMON_RESET_WORKER_PROCESS_LOST";

type CommonResetDb = Pick<
  PrismaClient,
  | "user"
  | "admin"
  | "adminLog"
  | "bulkPasswordResetRun"
  | "commonTemporaryPasswordResetRun"
>;

export interface CommonPasswordResetDependencies {
  db: CommonResetDb;
}

const defaultDependencies: CommonPasswordResetDependencies = { db: prisma };

type UserStatusKey = "ACTIVE" | "INACTIVE" | "BLOCKED" | "SUSPENDED";
type CommonRunStatus = CommonTemporaryPasswordResetRunStatus;

interface CommonResetJobContext {
  adminId: string;
  password: string;
  stopRequested: boolean;
  stopRequestedBy: string | null;
  safeBoundary: Promise<void>;
  resolveSafeBoundary: () => void;
}

const activeJobs = new Map<string, CommonResetJobContext>();

class CommonPasswordResetAdminStopError extends Error {
  constructor() {
    super(COMMON_PASSWORD_RESET_EMERGENCY_STOP_REASON);
    this.name = "CommonPasswordResetAdminStopError";
  }
}

function createJobContext(adminId: string, password: string): CommonResetJobContext {
  let resolveSafeBoundary!: () => void;
  const safeBoundary = new Promise<void>((resolve) => {
    resolveSafeBoundary = resolve;
  });
  return {
    adminId,
    password,
    stopRequested: false,
    stopRequestedBy: null,
    safeBoundary,
    resolveSafeBoundary,
  };
}

function getStatusCounts(
  groups: Array<{ status: UserStatusKey; _count: { _all: number } }>,
): Record<UserStatusKey, number> {
  const counts: Record<UserStatusKey, number> = {
    ACTIVE: 0,
    INACTIVE: 0,
    BLOCKED: 0,
    SUSPENDED: 0,
  };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

function leaseUntil(): Date {
  return new Date(Date.now() + COMMON_PASSWORD_RESET_WORKER_LEASE_MS);
}

async function forEachWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  callback: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let nextIndex = 0;
  let stopped = false;
  let firstError: unknown;

  const worker = async (): Promise<void> => {
    while (!stopped) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) return;

      try {
        await callback(item);
      } catch (error) {
        stopped = true;
        firstError = error;
        return;
      }
    }
  };

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (stopped) throw firstError;
}

type CommonPasswordResetFailureDiagnostic = {
  type: string;
  code: string | null;
  message: string;
};

function safeFailureDiagnostic(error: unknown): CommonPasswordResetFailureDiagnostic {
  const rawType = error instanceof Error ? error.name : "UnknownError";
  const type = rawType.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64) || "UnknownError";
  const rawCode =
    typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
      ? error.code
      : null;
  const code = rawCode && /^[A-Z][A-Z0-9_:-]{0,31}$/.test(rawCode) ? rawCode : null;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = /password|hash|token|secret|private key|credential|authorization|bearer/i.test(rawMessage)
    ? "Sensitive error details redacted"
    : rawMessage.replace(/\s+/g, " ").trim().slice(0, 240) || "Unknown error";

  return { type, code, message };
}

function safeFailureReason(
  batchNumber: number,
  diagnostic: CommonPasswordResetFailureDiagnostic,
): string {
  const codeSuffix = diagnostic.code ? `/${diagnostic.code}` : "";
  return `Common temporary password reset stopped in batch ${batchNumber} [${diagnostic.type}${codeSuffix}]: ${diagnostic.message}`;
}

function serializeRun(run: {
  id: string;
  status: CommonRunStatus;
  totalEligible: number;
  processedCount: number;
  failedCount: number;
  lastUserId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
  failureReason: string | null;
}) {
  return {
    runId: run.id,
    status: run.status,
    totalEligible: run.totalEligible,
    processedCount: run.processedCount,
    failedCount: run.failedCount,
    lastUserId: run.lastUserId,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    updatedAt: run.updatedAt,
    failureReason: run.failureReason,
  };
}

async function getActiveOperation(
  dependencies: CommonPasswordResetDependencies,
): Promise<"RANDOM_GENERATED" | "COMMON_TEMPORARY_PASSWORD" | null> {
  const [randomRun, commonRun] = await Promise.all([
    dependencies.db.bulkPasswordResetRun.findFirst({
      where: { status: { in: ["PREPARING", "RUNNING"] } },
      select: { id: true },
    }),
    dependencies.db.commonTemporaryPasswordResetRun.findFirst({
      where: { status: { in: ["PREPARING", "RUNNING"] } },
      select: { id: true },
    }),
  ]);
  if (randomRun) return "RANDOM_GENERATED";
  if (commonRun) return "COMMON_TEMPORARY_PASSWORD";
  return null;
}

export async function getCommonPasswordResetPreview(
  dependencies: CommonPasswordResetDependencies = defaultDependencies,
) {
  const [
    groups,
    totalNormalUsers,
    adminCount,
    passwordResetRequiredCount,
    unexpectedAuthVersionCount,
    activeOperation,
    activeCommonRun,
    resumableCommonRun,
  ] = await Promise.all([
    dependencies.db.user.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    dependencies.db.user.count(),
    dependencies.db.admin.count(),
    dependencies.db.user.count({ where: { passwordResetRequired: true } }),
    dependencies.db.user.count({ where: { authVersion: { not: 0 } } }),
    getActiveOperation(dependencies),
    dependencies.db.commonTemporaryPasswordResetRun.findFirst({
      where: { status: { in: ["PREPARING", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    }),
    dependencies.db.commonTemporaryPasswordResetRun.findFirst({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const statuses = getStatusCounts(
    groups as Array<{ status: UserStatusKey; _count: { _all: number } }>,
  );

  return {
    totalNormalUsers,
    activeUsers: statuses.ACTIVE,
    inactiveUsers: statuses.INACTIVE,
    blockedUsers: statuses.BLOCKED,
    suspendedUsers: statuses.SUSPENDED,
    adminCount,
    adminsExcluded: adminCount,
    passwordResetRequiredCount,
    unexpectedAuthVersionCount,
    activeCredentialReset: activeOperation !== null,
    activeOperation,
    eligibleToExecute: activeOperation === null && !resumableCommonRun,
    activeRun: activeCommonRun ? serializeRun(activeCommonRun) : null,
    resumableRun: resumableCommonRun ? serializeRun(resumableCommonRun) : null,
  };
}

export function validateCommonTemporaryPassword(password: string): void {
  if (
    password.length < 12 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new AppError(
      "Temporary password must be at least 12 characters and include uppercase, lowercase, number, and symbol characters",
      HTTP_STATUS.BAD_REQUEST,
      "WEAK_PASSWORD",
    );
  }
}

function assertPasswordInput(input: CommonPasswordResetExecuteInput): void {
  if (input.confirmation !== COMMON_PASSWORD_RESET_CONFIRMATION) {
    throw new AppError(
      "Exact common-password reset confirmation is required",
      HTTP_STATUS.BAD_REQUEST,
      "CONFIRMATION_REQUIRED",
    );
  }
  if (input.password !== input.confirmPassword) {
    throw new AppError(
      "Temporary password confirmation does not match",
      HTTP_STATUS.BAD_REQUEST,
      "PASSWORD_CONFIRMATION_MISMATCH",
    );
  }
  validateCommonTemporaryPassword(input.password);
}

async function assertNoActiveReset(
  dependencies: CommonPasswordResetDependencies,
): Promise<void> {
  const activeOperation = await getActiveOperation(dependencies);
  if (activeOperation) {
    throw new AppError(
      "Another bulk credential reset operation is currently running.",
      HTTP_STATUS.CONFLICT,
      "BULK_RESET_ALREADY_RUNNING",
    );
  }
}

export async function executeCommonPasswordReset(
  adminId: string,
  input: CommonPasswordResetExecuteInput,
  dependencies: CommonPasswordResetDependencies = defaultDependencies,
) {
  assertPasswordInput(input);

  let run;
  if (input.runId) {
    run = await dependencies.db.commonTemporaryPasswordResetRun.findUnique({
      where: { id: input.runId },
    });
    if (!run || run.adminId !== adminId) {
      throw new AppError("Common password reset run not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
    }
    if (run.status !== "FAILED") {
      throw new AppError(
        "Only a failed common password reset can be resumed",
        HTTP_STATUS.CONFLICT,
        "COMMON_RESET_NOT_RESUMABLE",
      );
    }
    if (run.totalEligible !== input.expectedUserCount) {
      throw new AppError(
        "Expected user count does not match the original common-password run",
        HTTP_STATUS.CONFLICT,
        "USER_COUNT_MISMATCH",
      );
    }
    await assertNoActiveReset(dependencies);
    const claimed = await dependencies.db.commonTemporaryPasswordResetRun.updateMany({
      where: { id: run.id, status: "FAILED", activeLockKey: null },
      data: {
        status: "RUNNING",
        activeLockKey: COMMON_PASSWORD_RESET_LOCK_KEY,
        failureReason: null,
        workerLeaseUntil: leaseUntil(),
        lastHeartbeatAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new AppError(
        "Another common password reset operation is currently running.",
        HTTP_STATUS.CONFLICT,
        "BULK_RESET_ALREADY_RUNNING",
      );
    }
    run = await dependencies.db.commonTemporaryPasswordResetRun.findUniqueOrThrow({
      where: { id: run.id },
    });
  } else {
    const preview = await getCommonPasswordResetPreview(dependencies);
    if (preview.activeCredentialReset) {
      throw new AppError(
        "Another bulk credential reset operation is currently running.",
        HTTP_STATUS.CONFLICT,
        "BULK_RESET_ALREADY_RUNNING",
      );
    }
    if (preview.resumableRun) {
      throw new AppError(
        "A failed common-password reset must be resumed before starting a new reset.",
        HTTP_STATUS.CONFLICT,
        "COMMON_RESET_RESUME_REQUIRED",
      );
    }
    if (preview.totalNormalUsers !== input.expectedUserCount) {
      throw new AppError(
        "Expected user count does not match the current normal-user count",
        HTTP_STATUS.CONFLICT,
        "USER_COUNT_MISMATCH",
      );
    }
    try {
      run = await dependencies.db.commonTemporaryPasswordResetRun.create({
        data: {
          adminId,
          status: "RUNNING",
          totalEligible: preview.totalNormalUsers,
          adminCount: preview.adminCount,
          activeLockKey: COMMON_PASSWORD_RESET_LOCK_KEY,
          workerLeaseUntil: leaseUntil(),
          lastHeartbeatAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        throw new AppError(
          "Another common password reset operation is currently running.",
          HTTP_STATUS.CONFLICT,
          "BULK_RESET_ALREADY_RUNNING",
        );
      }
      throw error;
    }
  }

  activeJobs.set(run.id, createJobContext(adminId, input.password));
  queueMicrotask(() => {
    void processCommonPasswordReset(run.id, dependencies);
  });

  return {
    ...serializeRun(run),
    accepted: true,
  };
}

export async function requestCommonPasswordResetEmergencyStop(
  adminId: string,
  runId: string,
  dependencies: CommonPasswordResetDependencies = defaultDependencies,
) {
  if (runId !== COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID) {
    throw new AppError(
      "Emergency common-password reset recovery is not enabled for this run",
      HTTP_STATUS.NOT_FOUND,
      "COMMON_RESET_EMERGENCY_RUN_NOT_FOUND",
    );
  }

  const run = await dependencies.db.commonTemporaryPasswordResetRun.findUnique({
    where: { id: runId },
  });
  if (!run || run.status !== "RUNNING") {
    throw new AppError(
      "The common-password reset run is not currently running",
      HTTP_STATUS.CONFLICT,
      "COMMON_RESET_NOT_RUNNING",
    );
  }

  const context = activeJobs.get(runId);
  if (!context) {
    throw new AppError(
      "The worker is not active in this process; safe emergency stop is unavailable",
      HTTP_STATUS.CONFLICT,
      "COMMON_RESET_STOP_UNSAFE",
    );
  }

  context.stopRequested = true;
  context.stopRequestedBy = adminId;
  await context.safeBoundary;

  const recovered = await dependencies.db.commonTemporaryPasswordResetRun.findUnique({
    where: { id: runId },
  });
  if (
    !recovered
    || recovered.status !== "FAILED"
    || recovered.failureReason !== COMMON_PASSWORD_RESET_EMERGENCY_STOP_REASON
  ) {
    throw new AppError(
      "The worker did not complete the safe emergency stop transition",
      HTTP_STATUS.CONFLICT,
      "COMMON_RESET_STOP_NOT_CONFIRMED",
    );
  }
  return serializeRun(recovered);
}

export async function recoverStrandedCommonPasswordResetRun(
  adminId: string,
  runId: string,
  dependencies: CommonPasswordResetDependencies = defaultDependencies,
) {
  if (runId !== COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID) {
    throw new AppError(
      "Stranded common-password reset recovery is not enabled for this run",
      HTTP_STATUS.NOT_FOUND,
      "COMMON_RESET_STRANDED_RUN_NOT_FOUND",
    );
  }

  const run = await dependencies.db.commonTemporaryPasswordResetRun.findUnique({
    where: { id: runId },
  });
  if (!run || run.status !== "RUNNING") {
    throw new AppError(
      "The common-password reset run is not currently running",
      HTTP_STATUS.CONFLICT,
      "COMMON_RESET_NOT_RUNNING",
    );
  }

  if (activeJobs.has(runId)) {
    throw new AppError(
      "The common-password reset worker is still active; use the cooperative emergency stop path",
      HTTP_STATUS.CONFLICT,
      "COMMON_RESET_WORKER_STILL_ACTIVE",
    );
  }

  const now = new Date();
  if (!run.workerLeaseUntil || run.workerLeaseUntil > now) {
    throw new AppError(
      "The common-password reset worker lease has not expired",
      HTTP_STATUS.CONFLICT,
      "COMMON_RESET_WORKER_LEASE_ACTIVE",
    );
  }

  const transition = await dependencies.db.commonTemporaryPasswordResetRun.updateMany({
    where: {
      id: runId,
      status: "RUNNING",
      activeLockKey: COMMON_PASSWORD_RESET_LOCK_KEY,
      workerLeaseUntil: { lte: now },
    },
    data: {
      status: "FAILED",
      failedCount: 1,
      failureReason: COMMON_PASSWORD_RESET_WORKER_PROCESS_LOST_REASON,
      activeLockKey: null,
      workerLeaseUntil: null,
    },
  });
  if (transition.count !== 1) {
    throw new AppError(
      "The stranded common-password reset run changed before recovery could claim it",
      HTTP_STATUS.CONFLICT,
      "COMMON_RESET_STRANDED_RECOVERY_NOT_CLAIMED",
    );
  }

  const recovered = await dependencies.db.commonTemporaryPasswordResetRun.findUniqueOrThrow({
    where: { id: runId },
  });
  await dependencies.db.adminLog.create({
    data: {
      adminId,
      action: "COMMON_TEMPORARY_PASSWORD_RESET_WORKER_LOST_RECOVERED",
      details: {
        runId,
        operationType: "COMMON_TEMPORARY_PASSWORD",
        processedCount: recovered.processedCount,
        lastUserId: recovered.lastUserId,
        totalEligible: recovered.totalEligible,
        failureReason: COMMON_PASSWORD_RESET_WORKER_PROCESS_LOST_REASON,
      },
    },
  }).catch(() => undefined);

  return serializeRun(recovered);
}

export async function getCommonPasswordResetStatus(
  adminId: string,
  runId: string,
  dependencies: CommonPasswordResetDependencies = defaultDependencies,
) {
  const run = await dependencies.db.commonTemporaryPasswordResetRun.findUnique({
    where: { id: runId },
  });
  if (!run || run.adminId !== adminId) {
    throw new AppError("Common password reset run not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
  }
  return serializeRun(run);
}

export async function recoverStaleCommonPasswordResetRuns(
  dependencies: CommonPasswordResetDependencies = defaultDependencies,
): Promise<number> {
  let result;
  try {
    result = await dependencies.db.commonTemporaryPasswordResetRun.updateMany({
      where: {
        status: { in: ["PREPARING", "RUNNING"] },
        workerLeaseUntil: { lt: new Date() },
      },
      data: {
        status: "FAILED",
        failedCount: 1,
        failureReason: "Common password reset worker lease expired",
        activeLockKey: null,
        workerLeaseUntil: null,
      },
    });
  } catch (error) {
    // Development workflows do not run migrations automatically. Treat the
    // absent feature table as "migration pending" rather than a boot failure.
    if (error instanceof Error && "code" in error && error.code === "P2021") {
      logger.warn("Common password reset migration is pending; stale-run recovery skipped");
      return 0;
    }
    throw error;
  }
  if (result.count > 0) {
    logger.warn({ count: result.count }, "Recovered stale common password reset run(s)");
  }
  return result.count;
}

async function processCommonPasswordReset(
  runId: string,
  dependencies: CommonPasswordResetDependencies,
): Promise<void> {
  const context = activeJobs.get(runId);
  if (!context) return;

  let heartbeatInFlight: Promise<void> | null = null;
  const refreshHeartbeat = (strict: boolean): Promise<void> => {
    const updatePromise =
      heartbeatInFlight ??
      (heartbeatInFlight = dependencies.db.commonTemporaryPasswordResetRun
        .update({
          where: { id: runId },
          data: {
            lastHeartbeatAt: new Date(),
            workerLeaseUntil: leaseUntil(),
          },
        })
        .then(() => undefined)
        .finally(() => {
          heartbeatInFlight = null;
        }));

    if (!strict) {
      void updatePromise.catch(() => {
        logger.warn({ runId }, "Common temporary password reset heartbeat update failed");
      });
      return Promise.resolve();
    }
    return updatePromise;
  };
  const settleHeartbeat = async (): Promise<void> => {
    await heartbeatInFlight?.catch(() => undefined);
  };
  const heartbeatTimer = setInterval(() => {
    void refreshHeartbeat(false);
  }, COMMON_PASSWORD_RESET_HEARTBEAT_INTERVAL_MS);

  let batchNumber = 0;
  let processedCount = 0;
  let checkpointedCount = 0;
  try {
    let run = await dependencies.db.commonTemporaryPasswordResetRun.findUnique({
      where: { id: runId },
    });
    if (!run || run.status !== "RUNNING" || run.adminId !== context.adminId) return;

    processedCount = run.processedCount;
    checkpointedCount = run.processedCount;
    let cursor = run.lastUserId;
    const startedAt = run.startedAt;

    while (true) {
      if (context.stopRequested) throw new CommonPasswordResetAdminStopError();

      const [currentUserCount, currentAdminCount] = await Promise.all([
        dependencies.db.user.count(),
        dependencies.db.admin.count(),
      ]);
      if (currentUserCount !== run.totalEligible || currentAdminCount !== run.adminCount) {
        throw new Error("User or Admin population changed during the common password reset");
      }

      const users = await dependencies.db.user.findMany({
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: "asc" },
        take: COMMON_PASSWORD_RESET_BATCH_SIZE,
        select: {
          id: true,
          passwordHash: true,
          authVersion: true,
          passwordResetRequired: true,
          passwordChangedAt: true,
          updatedAt: true,
        },
      });
      if (users.length === 0) break;
      batchNumber += 1;

      await forEachWithConcurrency(
        users,
        COMMON_PASSWORD_RESET_BCRYPT_CONCURRENCY,
        async (user) => {
          if (context.stopRequested) throw new CommonPasswordResetAdminStopError();

          const alreadyCommitted =
            user.passwordChangedAt !== null &&
            user.passwordChangedAt >= startedAt &&
            user.passwordResetRequired &&
            (await bcrypt.compare(context.password, user.passwordHash));

          if (!alreadyCommitted) {
            const passwordHash = await bcrypt.hash(
              context.password,
              parseInt(env.BCRYPT_ROUNDS, 10),
            );
            await dependencies.db.user.update({
              where: { id: user.id },
              data: {
                passwordHash,
                passwordResetRequired: true,
                authVersion: { increment: 1 },
                passwordChangedAt: new Date(),
                updatedAt: user.updatedAt,
              },
            });
          }
          processedCount += 1;

          if (processedCount % 25 === 0) {
            await refreshHeartbeat(true);
          }
        },
      );

      if (context.stopRequested) throw new CommonPasswordResetAdminStopError();

      cursor = users[users.length - 1]?.id ?? cursor;
      run = await dependencies.db.commonTemporaryPasswordResetRun.update({
        where: { id: runId },
        data: {
          status: "RUNNING",
          lastUserId: cursor,
          processedCount,
          lastHeartbeatAt: new Date(),
          workerLeaseUntil: leaseUntil(),
        },
      });
      checkpointedCount = processedCount;
    }

    clearInterval(heartbeatTimer);
    await settleHeartbeat();
    run = await dependencies.db.commonTemporaryPasswordResetRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        processedCount,
        completedAt: new Date(),
        activeLockKey: null,
        workerLeaseUntil: null,
        lastHeartbeatAt: new Date(),
      },
    });
    await dependencies.db.adminLog.create({
      data: {
        adminId: context.adminId,
        action: "COMMON_TEMPORARY_PASSWORD_RESET_COMPLETED",
        details: {
          runId,
          operationType: "COMMON_TEMPORARY_PASSWORD",
          targetCount: run.totalEligible,
          processedCount,
          failedCount: 0,
        },
      },
    });
  } catch (error) {
    clearInterval(heartbeatTimer);
    await settleHeartbeat();

    const adminStopped = error instanceof CommonPasswordResetAdminStopError;
    if (adminStopped) {
      const transition = await dependencies.db.commonTemporaryPasswordResetRun.updateMany({
        where: {
          id: runId,
          status: "RUNNING",
          activeLockKey: COMMON_PASSWORD_RESET_LOCK_KEY,
        },
        data: {
          status: "FAILED",
          failedCount: 1,
          // The current batch was intentionally not checkpointed. Preserve the
          // last durable cursor so resume replays only that incomplete batch.
          processedCount: checkpointedCount,
          failureReason: COMMON_PASSWORD_RESET_EMERGENCY_STOP_REASON,
          activeLockKey: null,
          workerLeaseUntil: null,
        },
      });
      if (transition.count !== 1) {
        logger.error(
          { runId },
          "Common temporary password reset emergency stop could not claim the RUNNING transition",
        );
      }
      await dependencies.db.adminLog.create({
        data: {
          adminId: context.stopRequestedBy ?? context.adminId,
          action: "COMMON_TEMPORARY_PASSWORD_RESET_ADMIN_STOPPED",
          details: {
            runId,
            operationType: "COMMON_TEMPORARY_PASSWORD",
            checkpointedCount,
            failureReason: COMMON_PASSWORD_RESET_EMERGENCY_STOP_REASON,
          },
        },
      }).catch(() => undefined);
    } else {
      const diagnostic = safeFailureDiagnostic(error);
      await dependencies.db.commonTemporaryPasswordResetRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          failedCount: 1,
          // A batch may have changed users before its checkpoint write. Keep the
          // durable count at the last completed checkpoint so a resume can
          // replay that batch idempotently without double-counting it.
          processedCount: checkpointedCount,
          failureReason: safeFailureReason(batchNumber, diagnostic),
          activeLockKey: null,
          workerLeaseUntil: null,
        },
      }).catch(() => undefined);
      await dependencies.db.adminLog.create({
        data: {
          adminId: context.adminId,
          action: "COMMON_TEMPORARY_PASSWORD_RESET_FAILED",
          details: {
            runId,
            operationType: "COMMON_TEMPORARY_PASSWORD",
            processedCount,
            failedCount: 1,
            diagnostic,
          },
        },
      }).catch(() => undefined);
      logger.error(
        { runId, batchNumber, processedCount, diagnostic },
        "Common temporary password reset stopped safely",
      );
    }
  } finally {
    clearInterval(heartbeatTimer);
    activeJobs.delete(runId);
    context.resolveSafeBoundary();
  }
}