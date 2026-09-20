import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient, BulkPasswordResetRunStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { logger } from "../lib/logger";
import {
  BULK_RESET_CONFIRMATION,
  type BulkPasswordResetExecuteInput,
} from "./bulk-reset.schema";
import {
  createBulkResetArtifactPath,
  productionBulkResetArtifactStore,
  type BulkResetArtifact,
  type BulkResetArtifactRecord,
  type BulkResetArtifactStore,
} from "./bulk-reset-artifact.service";

export const BULK_RESET_BATCH_SIZE = 250;
export const BULK_RESET_ARTIFACT_TTL_MS = 24 * 60 * 60_000;

export class BulkPasswordResetStoppedError extends AppError {
  constructor(
    public readonly runId: string,
    public readonly processedCount: number,
  ) {
    super(
      "Bulk reset stopped safely; no further users were processed",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "BULK_RESET_STOPPED",
    );
  }
}

type BulkResetDb = Pick<
  PrismaClient,
  "user" | "admin" | "adminLog" | "bulkPasswordResetRun"
>;

export interface BulkResetDependencies {
  db: BulkResetDb;
  artifactStore: BulkResetArtifactStore;
}

const defaultDependencies: BulkResetDependencies = {
  db: prisma,
  artifactStore: productionBulkResetArtifactStore,
};

type UserStatusKey = "ACTIVE" | "INACTIVE" | "BLOCKED" | "SUSPENDED";

interface BulkResetUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  authVersion: number;
}

export interface BulkPasswordResetPreview {
  totalNormalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  blockedUsers: number;
  suspendedUsers: number;
  expectedResetCount: number;
  adminCount: number;
  usersExcluded: number;
  unexpectedAuthVersionCount: number;
  passwordResetRequiredCount: number;
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

export async function getBulkPasswordResetPreview(
  dependencies: BulkResetDependencies = defaultDependencies,
): Promise<BulkPasswordResetPreview> {
  const [groups, totalNormalUsers, adminCount, unexpectedAuthVersionCount, passwordResetRequiredCount] =
    await Promise.all([
      dependencies.db.user.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      dependencies.db.user.count(),
      dependencies.db.admin.count(),
      dependencies.db.user.count({ where: { authVersion: { not: 0 } } }),
      dependencies.db.user.count({ where: { passwordResetRequired: true } }),
    ]);

  const statuses = getStatusCounts(groups as Array<{ status: UserStatusKey; _count: { _all: number } }>);
  return {
    totalNormalUsers,
    activeUsers: statuses.ACTIVE,
    inactiveUsers: statuses.INACTIVE,
    blockedUsers: statuses.BLOCKED,
    suspendedUsers: statuses.SUSPENDED,
    expectedResetCount: totalNormalUsers,
    adminCount,
    usersExcluded: 0,
    unexpectedAuthVersionCount,
    passwordResetRequiredCount,
  };
}

function generateTemporaryPassword(existing: Set<string>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let password = "";
  do {
    password = Array.from({ length: 24 }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (
    existing.has(password) ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  );
  existing.add(password);
  return password;
}

function safeFailureReason(batchNumber: number, userId?: string): string {
  return userId
    ? `Bulk reset stopped in batch ${batchNumber} while processing user ${userId}`
    : `Bulk reset stopped in batch ${batchNumber}`;
}

function serializeRunResult(run: {
  id: string;
  status: BulkPasswordResetRunStatus;
  totalEligible: number;
  processedCount: number;
  failedCount: number;
}) {
  return {
    runId: run.id,
    status: run.status,
    totalEligible: run.totalEligible,
    processedCount: run.processedCount,
    failedCount: run.failedCount,
    artifactAvailable: run.status === "COMPLETED",
  };
}

async function updateRunFailure(
  db: BulkResetDb,
  runId: string,
  reason: string,
  processedCount: number,
) {
  return db.bulkPasswordResetRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      failedCount: 1,
      failureReason: reason,
      processedCount,
    },
  });
}

export async function executeBulkPasswordReset(
  adminId: string,
  input: BulkPasswordResetExecuteInput,
  dependencies: BulkResetDependencies = defaultDependencies,
) {
  if (input.confirmation !== BULK_RESET_CONFIRMATION) {
    throw new AppError("Exact bulk reset confirmation is required", HTTP_STATUS.BAD_REQUEST, "CONFIRMATION_REQUIRED");
  }

  const activeRun = await dependencies.db.bulkPasswordResetRun.findFirst({
    where: { status: { in: ["PREPARING", "RUNNING"] } },
    select: { id: true },
  });
  if (activeRun && activeRun.id !== input.runId) {
    throw new AppError("Another bulk reset run is already active", HTTP_STATUS.CONFLICT, "BULK_RESET_IN_PROGRESS");
  }

  let run = input.runId
    ? await dependencies.db.bulkPasswordResetRun.findUnique({ where: { id: input.runId } })
    : null;
  let artifact: BulkResetArtifact;

  if (run) {
    if (run.adminId !== adminId) {
      throw new AppError("Bulk reset run is owned by another Admin", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
    }
    if (run.status === "COMPLETED") {
      return serializeRunResult(run);
    }
    if (run.status !== "FAILED") {
      throw new AppError("Bulk reset run is not resumable", HTTP_STATUS.CONFLICT, "BULK_RESET_NOT_RESUMABLE");
    }
    if (run.totalEligible !== input.expectedUserCount) {
      throw new AppError("Expected user count does not match the original run", HTTP_STATUS.CONFLICT, "USER_COUNT_MISMATCH");
    }
    artifact = await dependencies.artifactStore.read(run.artifactObjectPath);
    if (artifact.runId !== run.id) throw new Error("Bulk reset artifact does not match its run");
  } else {
    const preview = await getBulkPasswordResetPreview(dependencies);
    if (preview.expectedResetCount !== input.expectedUserCount) {
      throw new AppError("Expected user count does not match the current eligible count", HTTP_STATUS.CONFLICT, "USER_COUNT_MISMATCH");
    }
    if (preview.unexpectedAuthVersionCount > 0 || preview.passwordResetRequiredCount > 0) {
      throw new AppError(
        "Preflight found existing credential-reset state; no users were changed",
        HTTP_STATUS.CONFLICT,
        "BULK_RESET_PREFLIGHT_FAILED",
      );
    }

    const objectPath = createBulkResetArtifactPath();
    artifact = { version: 1, runId: "", records: [] };
    run = await dependencies.db.bulkPasswordResetRun.create({
      data: {
        adminId,
        status: "PREPARING",
        totalEligible: preview.expectedResetCount,
        adminCount: preview.adminCount,
        artifactObjectPath: objectPath,
        artifactExpiresAt: new Date(Date.now() + BULK_RESET_ARTIFACT_TTL_MS),
      },
    });
    artifact.runId = run.id;
    try {
      await dependencies.artifactStore.write(objectPath, artifact);
      run = await dependencies.db.bulkPasswordResetRun.update({
        where: { id: run.id },
        data: { status: "RUNNING" },
      });
      await dependencies.db.adminLog.create({
        data: {
          adminId,
          action: "BULK_PASSWORD_RESET_STARTED",
          details: {
            runId: run.id,
            eligibleUserCount: run.totalEligible,
            batchSize: BULK_RESET_BATCH_SIZE,
          },
        },
      });
    } catch {
      await dependencies.db.bulkPasswordResetRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          failedCount: 1,
          failureReason: "Bulk reset could not initialize its private credential artifact",
        },
      });
      throw new AppError(
        "Bulk reset could not initialize its private credential artifact",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        "BULK_RESET_ARTIFACT_UNAVAILABLE",
      );
    }
  }

  const committed = new Set(
    artifact.records.filter((record) => record.state === "committed").map((record) => record.userId),
  );
  const passwords = new Set(artifact.records.map((record) => record.password));
  let cursor = run.lastUserId;
  // The artifact is the source of truth after a crash. The run counter can
  // lag behind a successful user update if the process stopped before its
  // checkpoint write.
  let processedCount = committed.size;
  let batchNumber = 0;

  try {
    while (true) {
      const [currentUserCount, currentAdminCount] = await Promise.all([
        dependencies.db.user.count(),
        dependencies.db.admin.count(),
      ]);
      if (currentUserCount !== run.totalEligible || currentAdminCount !== run.adminCount) {
        throw new AppError("User or Admin population changed during the run", HTTP_STATUS.CONFLICT, "BULK_RESET_PRECONDITION_FAILED");
      }

      const users = await dependencies.db.user.findMany({
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: "asc" },
        take: BULK_RESET_BATCH_SIZE,
        select: { id: true, username: true, email: true, passwordHash: true, authVersion: true },
      }) as BulkResetUser[];

      if (users.length === 0) break;
      batchNumber += 1;

      const recordsByUser = new Map(artifact.records.map((record) => [record.userId, record]));
      const batchRecords: BulkResetArtifactRecord[] = [];
      for (const user of users) {
        if (committed.has(user.id)) continue;
        const existing = recordsByUser.get(user.id);
        const record = existing ?? {
          state: "prepared" as const,
          userId: user.id,
          username: user.username,
          email: user.email,
          password: generateTemporaryPassword(passwords),
        };
        if (!existing) {
          artifact.records.push(record);
          recordsByUser.set(user.id, record);
        }
        batchRecords.push(record);
      }

      if (batchRecords.length > 0) {
        await dependencies.artifactStore.write(run.artifactObjectPath, artifact);
      }

      for (const user of users) {
        if (committed.has(user.id)) continue;
        const record = recordsByUser.get(user.id);
        if (!record) throw new Error("Missing credential mapping");

        const passwordHash = await bcrypt.hash(record.password, parseInt(env.BCRYPT_ROUNDS, 10));
        const updated = await dependencies.db.user.updateMany({
          where: { id: user.id, authVersion: 0 },
          data: {
            passwordHash,
            passwordResetRequired: true,
            authVersion: { increment: 1 },
            passwordChangedAt: new Date(),
          },
        });

        if (updated.count !== 1) {
          const current = await dependencies.db.user.findUnique({
            where: { id: user.id },
            select: { passwordHash: true, authVersion: true },
          });
          if (!current || current.authVersion === 0 || !(await bcrypt.compare(record.password, current.passwordHash))) {
            throw new Error("Conditional user update did not apply");
          }
        }
        record.state = "committed";
        committed.add(user.id);
        processedCount += 1;
      }

      await dependencies.artifactStore.write(run.artifactObjectPath, artifact);
      cursor = users[users.length - 1]?.id;
      run = await dependencies.db.bulkPasswordResetRun.update({
        where: { id: run.id },
        data: { status: "RUNNING", lastUserId: cursor, processedCount },
      });
    }

    if (processedCount !== run.totalEligible || committed.size !== run.totalEligible) {
      throw new Error("Bulk reset completed with an incomplete credential mapping");
    }

    run = await dependencies.db.bulkPasswordResetRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date(), processedCount },
    });
    await dependencies.db.adminLog.create({
      data: {
        adminId,
        action: "BULK_PASSWORD_RESET_COMPLETED",
        details: { runId: run.id, successfulCount: processedCount },
      },
    });
    artifact.records.length = 0;
    return serializeRunResult(run);
  } catch (error) {
    const reason = safeFailureReason(batchNumber, cursor ?? undefined);
    run = await updateRunFailure(dependencies.db, run.id, reason, processedCount);
    await dependencies.db.adminLog.create({
      data: {
        adminId,
        action: "BULK_PASSWORD_RESET_FAILED",
        details: {
          runId: run.id,
          batchNumber,
          processedCount,
          failedCount: 1,
        },
      },
    }).catch(() => undefined);
    logger.error({ runId: run.id, batchNumber, processedCount }, "Bulk password reset stopped safely");
    throw new BulkPasswordResetStoppedError(run.id, processedCount);
  }
}

export async function downloadBulkPasswordResetArtifact(
  adminId: string,
  runId: string,
  dependencies: BulkResetDependencies = defaultDependencies,
): Promise<Buffer> {
  const run = await dependencies.db.bulkPasswordResetRun.findUnique({ where: { id: runId } });
  if (!run || run.adminId !== adminId) {
    throw new AppError("Bulk reset run not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
  }
  if (run.status !== "COMPLETED") {
    throw new AppError("Credential artifact is not ready", HTTP_STATUS.CONFLICT, "ARTIFACT_NOT_READY");
  }
  if (run.artifactDownloadedAt || run.artifactExpiresAt <= new Date()) {
    if (!run.artifactDownloadedAt && run.artifactExpiresAt <= new Date()) {
      await dependencies.artifactStore.delete(run.artifactObjectPath).catch(() => undefined);
      await dependencies.db.bulkPasswordResetRun.updateMany({
        where: { id: run.id, status: "COMPLETED", artifactDownloadedAt: null },
        data: { status: "EXPIRED" },
      }).catch(() => undefined);
    }
    throw new AppError("Credential artifact is no longer available", HTTP_STATUS.GONE, "ARTIFACT_EXPIRED");
  }

  const artifact = await dependencies.artifactStore.read(run.artifactObjectPath);
  const claimed = await dependencies.db.bulkPasswordResetRun.updateMany({
    where: { id: run.id, status: "COMPLETED", artifactDownloadedAt: null },
    data: { artifactDownloadedAt: new Date() },
  });
  if (claimed.count !== 1) {
    throw new AppError("Credential artifact was already downloaded", HTTP_STATUS.GONE, "ARTIFACT_ALREADY_DOWNLOADED");
  }

  try {
    return Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8");
  } finally {
    await dependencies.artifactStore.delete(run.artifactObjectPath);
  }
}