import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("../../config/env", () => ({
  env: { BCRYPT_ROUNDS: "4" },
}));
vi.mock("../../config/prisma", () => ({
  prisma: {},
}));
vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import {
  BULK_RESET_MARKED_FAILED_ACTION,
  BULK_RESET_WORKER_TERMINATED_REASON,
  DEAD_RANDOM_BULK_RESET_RUN_ID,
  executeBulkPasswordReset,
  getBulkPasswordResetPreview,
  downloadBulkPasswordResetArtifact,
  markDeadBulkPasswordResetRunFailed,
} from "../bulk-reset.service";
import { BULK_RESET_CONFIRMATION } from "../bulk-reset.schema";
import type {
  BulkResetArtifact,
  BulkResetArtifactStore,
} from "../bulk-reset-artifact.service";
import type { BulkResetDependencies } from "../bulk-reset.service";

type FakeUser = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  authVersion: number;
  updatedAt: Date;
  passwordResetRequired: boolean;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED" | "SUSPENDED";
  firstName: string;
  referralCode: string;
};

function createUser(id: string, status: FakeUser["status"] = "ACTIVE"): FakeUser {
  return {
    id,
    username: `user-${id}`,
    email: `${id}@example.test`,
    passwordHash: bcrypt.hashSync(`old-password-${id}`, 4),
    authVersion: 0,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordResetRequired: false,
    status,
    firstName: `First ${id}`,
    referralCode: `ref-${id}`,
  };
}

function createFakeDependencies(users: FakeUser[]) {
  const rows = new Map(users.map((user) => [user.id, structuredClone(user)]));
  const admins = [{ id: "admin-1" }];
  const runs = new Map<string, any>();
  const objects = new Map<string, BulkResetArtifact>();
  let runSequence = 0;
  const failingUsers = new Set<string>();

  const artifactStore: BulkResetArtifactStore = {
    async write(path, artifact) {
      objects.set(path, structuredClone(artifact));
    },
    async read(path) {
      const artifact = objects.get(path);
      if (!artifact) throw new Error("artifact missing");
      return structuredClone(artifact);
    },
    async delete(path) {
      objects.delete(path);
    },
  };

  const db = {
    user: {
      groupBy: vi.fn(async () => {
        const counts = new Map<string, number>();
        for (const user of rows.values()) counts.set(user.status, (counts.get(user.status) ?? 0) + 1);
        return [...counts.entries()].map(([status, count]) => ({ status, _count: { _all: count } }));
      }),
      count: vi.fn(async (args?: { where?: { authVersion?: { not: number }; passwordResetRequired?: boolean } }) => {
        let selected = [...rows.values()];
        if (args?.where?.authVersion) selected = selected.filter((user) => user.authVersion !== args.where!.authVersion!.not);
        if (args?.where?.passwordResetRequired !== undefined) {
          selected = selected.filter((user) => user.passwordResetRequired === args.where!.passwordResetRequired);
        }
        return selected.length;
      }),
      findMany: vi.fn(async (args: { where?: { id?: { gt: string } }; take: number }) => {
        const cursor = args.where?.id?.gt;
        return [...rows.values()]
          .filter((user) => !cursor || user.id > cursor)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, args.take)
          .map(({ id, username, email, passwordHash, authVersion, updatedAt }) => ({
            id, username, email, passwordHash, authVersion, updatedAt,
          }));
      }),
      updateMany: vi.fn(async (args: {
        where: { id: string; authVersion: number };
        data: { passwordHash: string; passwordResetRequired: boolean; authVersion: { increment: number }; passwordChangedAt: Date; updatedAt: Date };
      }) => {
        if (failingUsers.has(args.where.id)) throw new Error("forced batch failure");
        const user = rows.get(args.where.id);
        if (!user || user.authVersion !== args.where.authVersion) return { count: 0 };
        user.passwordHash = args.data.passwordHash;
        user.passwordResetRequired = args.data.passwordResetRequired;
        user.authVersion += args.data.authVersion.increment;
        user.updatedAt = args.data.updatedAt;
        return { count: 1 };
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const user = rows.get(args.where.id);
        return user ? { passwordHash: user.passwordHash, authVersion: user.authVersion } : null;
      }),
    },
    admin: {
      count: vi.fn(async () => admins.length),
    },
    bulkPasswordResetRun: {
      findFirst: vi.fn(async (args: { where: { status: { in: string[] } } }) => {
        return [...runs.values()].find((run) => args.where.status.in.includes(run.status)) ?? null;
      }),
      create: vi.fn(async (args: { data: any }) => {
        const run = {
          id: `run-${++runSequence}`,
          ...args.data,
          processedCount: 0,
          failedCount: 0,
          lastUserId: null,
          artifactDownloadedAt: null,
          failureReason: null,
          startedAt: new Date(),
          completedAt: null,
          updatedAt: new Date(),
        };
        runs.set(run.id, run);
        return run;
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => runs.get(args.where.id) ?? null),
      findUniqueOrThrow: vi.fn(async (args: { where: { id: string } }) => {
        const run = runs.get(args.where.id);
        if (!run) throw new Error("run missing");
        return run;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: any }) => {
        const run = runs.get(args.where.id);
        if (!run) throw new Error("run missing");
        Object.assign(run, args.data, { updatedAt: new Date() });
        return run;
      }),
      updateMany: vi.fn(async (args: { where: any; data: any }) => {
        const run = runs.get(args.where.id);
        if (!run) return { count: 0 };
        if (args.where.status !== undefined && run.status !== args.where.status) return { count: 0 };
        if (
          Object.prototype.hasOwnProperty.call(args.where, "artifactDownloadedAt")
          && run.artifactDownloadedAt !== args.where.artifactDownloadedAt
        ) {
          return { count: 0 };
        }
        Object.assign(run, args.data);
        return { count: 1 };
      }),
    },
    adminLog: {
      create: vi.fn(async (args: { data: any }) => ({ id: "log-1", ...args.data })),
    },
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db)),
  };

  return {
    dependencies: { db, artifactStore } as unknown as BulkResetDependencies,
    rows,
    runs,
    objects,
    failingUsers,
    db,
  };
}

describe("Super Admin bulk normal-user password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews every normal-user status and reports Admins separately without changing rows", async () => {
    const fake = createFakeDependencies([
      createUser("1", "ACTIVE"),
      createUser("2", "INACTIVE"),
      createUser("3", "BLOCKED"),
      createUser("4", "SUSPENDED"),
    ]);
    const before = structuredClone([...fake.rows.values()]);

    await expect(getBulkPasswordResetPreview(fake.dependencies)).resolves.toMatchObject({
      totalNormalUsers: 4,
      activeUsers: 1,
      inactiveUsers: 1,
      blockedUsers: 1,
      suspendedUsers: 1,
      expectedResetCount: 4,
      adminCount: 1,
      usersExcluded: 0,
      unexpectedAuthVersionCount: 0,
    });
    expect([...fake.rows.values()]).toEqual(before);
  });

  it("resets one or many users with unique credentials and an exact artifact mapping", async () => {
    const fake = createFakeDependencies([
      createUser("1", "ACTIVE"),
      createUser("2", "INACTIVE"),
      createUser("3", "BLOCKED"),
    ]);
    const beforeBusinessFields = [...fake.rows.values()].map(({ id, status, firstName, referralCode }) => ({
      id, status, firstName, referralCode,
    }));

    const result = await executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 3,
    }, fake.dependencies);

    expect(result).toMatchObject({ status: "COMPLETED", totalEligible: 3, processedCount: 3, failedCount: 0 });
    const artifact = [...fake.objects.values()][0]!;
    expect(artifact.records).toHaveLength(3);
    expect(new Set(artifact.records.map((record) => record.password)).size).toBe(3);
    expect(artifact.records.every((record) => record.state === "committed")).toBe(true);
    for (const record of artifact.records) {
      const user = fake.rows.get(record.userId)!;
      expect(user.passwordHash).not.toBe(`old-hash-${record.userId}`);
      await expect(bcrypt.compare(record.password, user.passwordHash)).resolves.toBe(true);
      await expect(bcrypt.compare(`old-password-${record.userId}`, user.passwordHash)).resolves.toBe(false);
      expect(user.passwordResetRequired).toBe(true);
      expect(user.authVersion).toBe(1);
    }
    expect([...fake.rows.values()].map(({ id, status, firstName, referralCode }) => ({
      id, status, firstName, referralCode,
    }))).toEqual(beforeBusinessFields);
    expect(fake.db.adminLog.create).toHaveBeenCalledTimes(2);
    const auditPayload = JSON.stringify(fake.db.adminLog.create.mock.calls);
    expect(auditPayload).not.toContain("password");
    expect(auditPayload).not.toContain("$2");
  });

  it("rejects the wrong phrase, wrong count, and preflight auth state before any user update", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    await expect(executeBulkPasswordReset("admin-1", {
      confirmation: "confirm=true",
      expectedUserCount: 1,
    }, fake.dependencies)).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    await expect(executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 2,
    }, fake.dependencies)).rejects.toMatchObject({ code: "USER_COUNT_MISMATCH" });
    expect(fake.db.user.updateMany).not.toHaveBeenCalled();

    fake.rows.get("1")!.authVersion = 1;
    await expect(executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 1,
    }, fake.dependencies)).rejects.toMatchObject({ code: "BULK_RESET_PREFLIGHT_FAILED" });
    expect(fake.db.user.updateMany).not.toHaveBeenCalled();
  });

  it("stops on a failed batch, then resumes the same run without generating duplicate passwords", async () => {
    const fake = createFakeDependencies([createUser("1"), createUser("2"), createUser("3")]);
    fake.failingUsers.add("2");

    await expect(executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 3,
    }, fake.dependencies)).rejects.toMatchObject({ code: "BULK_RESET_STOPPED" });
    const failedRun = [...fake.runs.values()][0];
    expect(failedRun.status).toBe("FAILED");
    expect(fake.rows.get("1")!.authVersion).toBe(1);
    expect(fake.rows.get("3")!.authVersion).toBe(0);
    const artifactBeforeResume = structuredClone([...fake.objects.values()][0]!);
    const firstPassword = artifactBeforeResume.records.find((record) => record.userId === "1")!.password;

    fake.failingUsers.clear();
    const resumed = await executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 3,
      runId: failedRun.id,
    }, fake.dependencies);
    expect(resumed.status).toBe("COMPLETED");
    const finalArtifact = [...fake.objects.values()][0]!;
    expect(finalArtifact.records.find((record) => record.userId === "1")!.password).toBe(firstPassword);
    expect(finalArtifact.records).toHaveLength(3);
    expect(new Set(finalArtifact.records.map((record) => record.password)).size).toBe(3);
    expect([...fake.rows.values()].every((user) => user.authVersion === 1)).toBe(true);
  });

  it("does not reset a completed run again and consumes the artifact only once", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    const result = await executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 1,
    }, fake.dependencies);
    const hashAfterCompletion = fake.rows.get("1")!.passwordHash;

    await expect(executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 1,
      runId: result.runId,
    }, fake.dependencies)).rejects.toMatchObject({ code: "BULK_RESET_ALREADY_COMPLETED" });
    expect(fake.rows.get("1")!.passwordHash).toBe(hashAfterCompletion);

    const downloaded = await downloadBulkPasswordResetArtifact("admin-1", result.runId, fake.dependencies);
    expect(downloaded.toString("utf8")).toContain(result.runId);
    await expect(downloadBulkPasswordResetArtifact("admin-1", result.runId, fake.dependencies))
      .rejects.toMatchObject({ code: "ARTIFACT_EXPIRED" });
    expect(fake.objects.size).toBe(0);
  });

  it("returns the artifact when private-object cleanup fails after claiming it", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    const result = await executeBulkPasswordReset("admin-1", {
      confirmation: BULK_RESET_CONFIRMATION,
      expectedUserCount: 1,
    }, fake.dependencies);
    fake.dependencies.artifactStore.delete = vi.fn(async () => {
      throw new Error("forced artifact cleanup failure");
    });

    const downloaded = await downloadBulkPasswordResetArtifact("admin-1", result.runId, fake.dependencies);

    expect(downloaded.toString("utf8")).toContain(result.runId);
    await expect(downloadBulkPasswordResetArtifact("admin-1", result.runId, fake.dependencies))
      .rejects.toMatchObject({ code: "ARTIFACT_EXPIRED" });
  });

  it("marks only the confirmed dead run failed without changing user or business fields", async () => {
    const fake = createFakeDependencies([createUser("1"), createUser("2")]);
    const startedAt = new Date("2026-09-20T11:07:52.004Z");
    const updatedAt = new Date("2026-09-20T11:12:39.117Z");
    const artifactExpiresAt = new Date("2026-09-21T11:07:52.004Z");
    fake.runs.set(DEAD_RANDOM_BULK_RESET_RUN_ID, {
      id: DEAD_RANDOM_BULK_RESET_RUN_ID,
      adminId: "old-admin",
      status: "RUNNING",
      totalEligible: 6640,
      adminCount: 1,
      processedCount: 750,
      failedCount: 0,
      lastUserId: "checkpoint-user",
      artifactObjectPath: "/objects/bulk-password-reset/old.jsonl",
      artifactExpiresAt,
      artifactDownloadedAt: null,
      failureReason: null,
      startedAt,
      completedAt: null,
      updatedAt,
    });
    const usersBefore = structuredClone([...fake.rows.values()]);

    const result = await markDeadBulkPasswordResetRunFailed(
      "acting-super-admin",
      DEAD_RANDOM_BULK_RESET_RUN_ID,
      fake.dependencies,
    );

    expect(result).toMatchObject({
      runId: DEAD_RANDOM_BULK_RESET_RUN_ID,
      status: "FAILED",
      totalEligible: 6640,
      processedCount: 750,
      failedCount: 0,
      failureReason: BULK_RESET_WORKER_TERMINATED_REASON,
    });
    const run = fake.runs.get(DEAD_RANDOM_BULK_RESET_RUN_ID);
    expect(run).toMatchObject({
      status: "FAILED",
      totalEligible: 6640,
      processedCount: 750,
      failedCount: 0,
      lastUserId: "checkpoint-user",
      artifactObjectPath: "/objects/bulk-password-reset/old.jsonl",
      artifactExpiresAt,
      artifactDownloadedAt: null,
      startedAt,
      completedAt: null,
    });
    expect(run.updatedAt).toEqual(updatedAt);
    expect([...fake.rows.values()]).toEqual(usersBefore);
    expect(fake.db.user.updateMany).not.toHaveBeenCalled();
    expect(fake.db.adminLog.create).toHaveBeenCalledWith({
      data: {
        adminId: "acting-super-admin",
        action: BULK_RESET_MARKED_FAILED_ACTION,
        details: {
          runId: DEAD_RANDOM_BULK_RESET_RUN_ID,
          previousStatus: "RUNNING",
          newStatus: "FAILED",
          reason: BULK_RESET_WORKER_TERMINATED_REASON,
          actingAdminId: "acting-super-admin",
        },
      },
    });
  });

  it("rejects an arbitrary run ID without touching the database", async () => {
    const fake = createFakeDependencies([]);

    await expect(markDeadBulkPasswordResetRunFailed(
      "acting-super-admin",
      "another-run",
      fake.dependencies,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.db.bulkPasswordResetRun.findUnique).not.toHaveBeenCalled();
    expect(fake.db.bulkPasswordResetRun.updateMany).not.toHaveBeenCalled();
    expect(fake.db.adminLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["FAILED", "BULK_RESET_NOT_RUNNING"],
    ["COMPLETED", "BULK_RESET_NOT_RUNNING"],
  ] as const)("returns a safe conflict for an already %s run", async (status, code) => {
    const fake = createFakeDependencies([]);
    fake.runs.set(DEAD_RANDOM_BULK_RESET_RUN_ID, {
      id: DEAD_RANDOM_BULK_RESET_RUN_ID,
      status,
    });

    await expect(markDeadBulkPasswordResetRunFailed(
      "acting-super-admin",
      DEAD_RANDOM_BULK_RESET_RUN_ID,
      fake.dependencies,
    )).rejects.toMatchObject({ code });
    expect(fake.db.bulkPasswordResetRun.updateMany).not.toHaveBeenCalled();
    expect(fake.db.adminLog.create).not.toHaveBeenCalled();
  });

  it("returns not found for a nonexistent confirmed run", async () => {
    const fake = createFakeDependencies([]);

    await expect(markDeadBulkPasswordResetRunFailed(
      "acting-super-admin",
      DEAD_RANDOM_BULK_RESET_RUN_ID,
      fake.dependencies,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.db.bulkPasswordResetRun.updateMany).not.toHaveBeenCalled();
    expect(fake.db.adminLog.create).not.toHaveBeenCalled();
  });
});