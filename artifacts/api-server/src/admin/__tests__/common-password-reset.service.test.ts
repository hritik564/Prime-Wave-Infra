import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("../../config/env", () => ({
  env: { BCRYPT_ROUNDS: "4" },
}));
vi.mock("../../config/prisma", () => ({
  prisma: {},
}));
vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import {
  COMMON_PASSWORD_RESET_EMERGENCY_STOP_REASON,
  COMMON_PASSWORD_RESET_WORKER_PROCESS_LOST_REASON,
  executeCommonPasswordReset,
  executeFullReplacementPasswordReset,
  getFullReplacementPasswordResetPreview,
  getCommonPasswordResetPreview,
  recoverStrandedCommonPasswordResetRun,
  requestCommonPasswordResetEmergencyStop,
} from "../common-password-reset.service";
import {
  COMMON_PASSWORD_RESET_CONFIRMATION,
  COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID,
  FULL_REPLACEMENT_PASSWORD_RESET_CONFIRMATION,
  type CommonPasswordResetExecuteInput,
} from "../common-password-reset.schema";
import type { CommonPasswordResetDependencies } from "../common-password-reset.service";
import {
  FULL_REPLACEMENT_WORKER_EXIT_FAILURE_REASON,
  recoverUnexpectedFullReplacementWorkerExit,
} from "../full-replacement-worker-recovery";
import { isDedicatedFullReplacementRun } from "../full-replacement-worker-guard";
import {
  sendFullReplacementWorkerMessage,
  type FullReplacementWorkerIpcChild,
} from "../full-replacement-worker-launcher";

type FakeUser = {
  id: string;
  passwordHash: string;
  authVersion: number;
  passwordResetRequired: boolean;
  passwordChangedAt: Date | null;
  fullReplacementPasswordResetRunId: string | null;
  updatedAt: Date;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED" | "SUSPENDED";
};

function createUser(id: string, status: FakeUser["status"] = "ACTIVE"): FakeUser {
  return {
    id,
    passwordHash: bcrypt.hashSync(`old-${id}`, 4),
    authVersion: 0,
    passwordResetRequired: false,
    passwordChangedAt: null,
    fullReplacementPasswordResetRunId: null,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    status,
  };
}

function createFakeDependencies(
  users: FakeUser[],
  activeRandomRun = false,
  initialFailureAfterUpdates: number | null = null,
  runIdOverride?: string,
  failureError = new Error("simulated user update interruption"),
) {
  const rows = new Map(users.map((user) => [user.id, structuredClone(user)]));
  const runs = new Map<string, any>();
  const logs: any[] = [];
  let sequence = 0;
  let failureAfterUpdates = initialFailureAfterUpdates;

  const db = {
    user: {
      groupBy: vi.fn(async () => {
        const counts = new Map<string, number>();
        for (const user of rows.values()) {
          counts.set(user.status, (counts.get(user.status) ?? 0) + 1);
        }
        return [...counts.entries()].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      }),
      count: vi.fn(async () => rows.size),
      findMany: vi.fn(async (args: { where?: any; take: number }) => {
        const cursor = args.where?.id?.gt;
        return [...rows.values()]
          .filter((user) => !cursor || user.id > cursor)
          .filter((user) =>
            args.where?.passwordResetRequired === undefined
            || user.passwordResetRequired === args.where.passwordResetRequired)
          .filter((user) =>
            !args.where?.passwordChangedAt?.gte
            || user.passwordChangedAt !== null
            && user.passwordChangedAt >= args.where.passwordChangedAt.gte)
          .filter((user) =>
            args.where?.fullReplacementPasswordResetRunId === undefined
            || user.fullReplacementPasswordResetRunId
              === args.where.fullReplacementPasswordResetRunId)
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, args.take)
          .map((user) => ({ ...user }));
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const user = rows.get(args.where.id);
        return user ? { ...user } : null;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: any }) => {
        const user = rows.get(args.where.id);
        if (!user) throw new Error("user missing");
        if (failureAfterUpdates === 0) {
          failureAfterUpdates = null;
          throw failureError;
        }
        if (failureAfterUpdates !== null) failureAfterUpdates -= 1;
        if (args.data.authVersion?.increment) {
          user.authVersion += args.data.authVersion.increment;
        }
        const { authVersion: _authVersion, ...rest } = args.data;
        Object.assign(user, rest);
        return user;
      }),
    },
    admin: {
      count: vi.fn(async () => 2),
    },
    bulkPasswordResetRun: {
      findFirst: vi.fn(async () => (activeRandomRun ? { id: "random-run" } : null)),
    },
    commonTemporaryPasswordResetRun: {
      findFirst: vi.fn(async (args: any) => {
        const statuses = args.where.status.in ?? [args.where.status];
          const expectedOperation = args.where.operationType;
          const matchingRuns = [...runs.values()].filter((run) =>
            statuses.includes(run.status)
            && (
              expectedOperation === undefined
              || (run.operationType ?? "COMMON_TEMPORARY_PASSWORD") === expectedOperation
            ));
        if (args.orderBy?.updatedAt === "desc") {
          matchingRuns.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
        }
        if (args.orderBy?.createdAt === "desc") {
          matchingRuns.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
        }
        return matchingRuns[0] ?? null;
      }),
      findUnique: vi.fn(async (args: any) => runs.get(args.where.id) ?? null),
      findUniqueOrThrow: vi.fn(async (args: any) => {
        const run = runs.get(args.where.id);
        if (!run) throw new Error("run missing");
        return run;
      }),
      create: vi.fn(async (args: any) => {
        const run = {
          id: runIdOverride ?? `common-run-${++sequence}`,
          operationType: "COMMON_TEMPORARY_PASSWORD",
          ...args.data,
          lastUserId: null,
          processedCount: 0,
          failedCount: 0,
          failureReason: null,
          completedAt: null,
          startedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        runs.set(run.id, run);
        return run;
      }),
      update: vi.fn(async (args: any) => {
        const run = runs.get(args.where.id);
        if (!run) throw new Error("run missing");
        Object.assign(run, args.data, { updatedAt: new Date() });
        return run;
      }),
      updateMany: vi.fn(async (args: any) => {
        const run = runs.get(args.where.id);
        if (!run) return { count: 0 };
        for (const [key, value] of Object.entries(args.where)) {
          if (key === "activeLockKey" && value === null && run.activeLockKey !== null) return { count: 0 };
          if (key === "status" && run.status !== value) return { count: 0 };
          if (
            key === "workerLeaseUntil"
            && typeof value === "object"
            && value !== null
            && "lte" in value
            && run.workerLeaseUntil > (value as { lte: Date }).lte
          ) return { count: 0 };
        }
        Object.assign(run, args.data, { updatedAt: new Date() });
        return { count: 1 };
      }),
    },
    adminLog: {
      create: vi.fn(async (args: any) => {
        logs.push(args.data);
        return { id: `log-${logs.length}` };
      }),
    },
  };
  (db as any).$transaction = vi.fn(async (
    callback: (transactionDb: typeof db) => Promise<unknown>,
  ) => callback(db));

  return {
    dependencies: { db } as unknown as CommonPasswordResetDependencies,
    rows,
    runs,
    logs,
    db,
    setFailureAfterUpdates: (count: number | null) => {
      failureAfterUpdates = count;
    },
  };
}

const validInput = (expectedUserCount: number): CommonPasswordResetExecuteInput => ({
  password: "Common-Temporary-42!",
  confirmPassword: "Common-Temporary-42!",
  confirmation: COMMON_PASSWORD_RESET_CONFIRMATION,
  expectedUserCount,
});

const validReplacementInput = (expectedUserCount: number) => ({
  password: "Replacement-Temporary-73!",
  confirmPassword: "Replacement-Temporary-73!",
  confirmation: "REPLACE TEMPORARY PASSWORD FOR ALL NORMAL USERS" as const,
  expectedUserCount,
} as const);

async function waitForCompletion(fake: ReturnType<typeof createFakeDependencies>, runId: string) {
  for (let attempt = 0; attempt < 3000; attempt += 1) {
    const run = fake.runs.get(runId);
    if (run?.status === "COMPLETED" || run?.status === "FAILED") return run;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("common reset worker did not finish");
}

describe("common temporary password reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("previews every user status and reports the active-operation lock", async () => {
    const fake = createFakeDependencies([
      createUser("1", "ACTIVE"),
      createUser("2", "INACTIVE"),
      createUser("3", "BLOCKED"),
      createUser("4", "SUSPENDED"),
    ], true);

    await expect(getCommonPasswordResetPreview(fake.dependencies)).resolves.toMatchObject({
      totalNormalUsers: 4,
      activeUsers: 1,
      inactiveUsers: 1,
      blockedUsers: 1,
      suspendedUsers: 1,
      adminCount: 2,
      adminsExcluded: 2,
      activeCredentialReset: true,
      activeOperation: "RANDOM_GENERATED",
      eligibleToExecute: false,
    });
  });

  it("applies one plaintext to all users with separate bcrypt salts and preserves status", async () => {
    const fake = createFakeDependencies([
      createUser("1", "ACTIVE"),
      createUser("2", "BLOCKED"),
      createUser("3", "SUSPENDED"),
    ]);
    const result = await executeCommonPasswordReset(
      "admin-1",
      validInput(3),
      fake.dependencies,
    );
    expect(result).toMatchObject({
      accepted: true,
      status: "RUNNING",
      totalEligible: 3,
    });

    const run = await waitForCompletion(fake, result.runId);
    expect(run).toMatchObject({
      status: "COMPLETED",
      processedCount: 3,
      failedCount: 0,
    });

    const hashes = [...fake.rows.values()].map((user) => user.passwordHash);
    expect(new Set(hashes).size).toBe(3);
    for (const user of fake.rows.values()) {
      await expect(bcrypt.compare("Common-Temporary-42!", user.passwordHash)).resolves.toBe(true);
      expect(user.passwordResetRequired).toBe(true);
      expect(user.authVersion).toBe(1);
      expect(user.passwordChangedAt).toBeInstanceOf(Date);
      expect(user.fullReplacementPasswordResetRunId).toBeNull();
    }
    expect(fake.rows.get("2")?.status).toBe("BLOCKED");
    expect(fake.rows.get("3")?.status).toBe("SUSPENDED");

    const serialized = JSON.stringify({ runs: [...fake.runs.values()], logs: fake.logs });
    expect(serialized).not.toContain("Common-Temporary-42!");
    expect(serialized).not.toContain("$2");
  });

  it("starts a distinct full replacement run and overwrites users changed by an earlier run", async () => {
    const fake = createFakeDependencies([
      createUser("1", "ACTIVE"),
      createUser("2", "BLOCKED"),
      createUser("3", "SUSPENDED"),
    ]);
    const oldHash = bcrypt.hashSync("Old-Temporary-42!", 4);
    const previous = fake.rows.get("1");
    if (!previous) throw new Error("missing fixture user");
    previous.passwordHash = oldHash;
    previous.passwordResetRequired = true;
    previous.authVersion = 1;
    previous.passwordChangedAt = new Date("2026-01-01T00:00:00.000Z");

    const result = await executeFullReplacementPasswordReset(
      "admin-1",
      validReplacementInput(3),
      fake.dependencies,
    );
    const completed = await waitForCompletion(fake, result.runId);

    expect(result.operationType).toBe("FULL_REPLACEMENT");
    expect(completed).toMatchObject({
      status: "COMPLETED",
      processedCount: 3,
    });
    for (const user of fake.rows.values()) {
      await expect(bcrypt.compare("Replacement-Temporary-73!", user.passwordHash)).resolves.toBe(true);
      expect(user.passwordResetRequired).toBe(true);
      expect(user.fullReplacementPasswordResetRunId).toBe(result.runId);
    }
    expect(new Set([...fake.rows.values()].map((user) => user.passwordHash)).size).toBe(1);
    expect(fake.rows.get("1")?.authVersion).toBe(2);
    const persisted = JSON.stringify({ runs: [...fake.runs.values()], logs: fake.logs });
    expect(persisted).not.toContain("Replacement-Temporary-73!");
    expect(persisted).not.toContain("$2");
  });

  it("keeps the full replacement lock through atomic completion and audit finalization", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    const transaction = (fake.db as any).$transaction as ReturnType<typeof vi.fn>;
    let runId = "";
    transaction.mockImplementation(async (callback: (transactionDb: typeof fake.db) => Promise<unknown>) => {
      const before = fake.runs.get(runId);
      expect(before?.status).toBe("RUNNING");
      expect(before?.activeLockKey).toBe("FULL_REPLACEMENT_PASSWORD_RESET");
      const result = await callback(fake.db);
      const after = fake.runs.get(runId);
      expect(after?.status).toBe("COMPLETED");
      expect(after?.activeLockKey).toBeNull();
      expect(fake.logs.at(-1)?.action).toBe("FULL_REPLACEMENT_PASSWORD_RESET_COMPLETED");
      return result;
    });

    const result = await executeFullReplacementPasswordReset(
      "admin-1",
      validReplacementInput(1),
      fake.dependencies,
    );
    runId = result.runId;
    await waitForCompletion(fake, runId);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("dispatches full replacement work to the dedicated launcher when provided", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    const launchWorker = vi.fn();
    fake.dependencies.launchFullReplacementWorker = launchWorker;

    const result = await executeFullReplacementPasswordReset(
      "admin-1",
      validReplacementInput(1),
      fake.dependencies,
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(launchWorker).toHaveBeenCalledWith(
      result.runId,
      "admin-1",
      "Replacement-Temporary-73!",
    );
    expect(fake.db.user.update).not.toHaveBeenCalled();
    expect(fake.rows.get("1")?.authVersion).toBe(0);
  });

  it("fails closed for non-FULL_REPLACEMENT runs inside the dedicated worker guard", () => {
    expect(isDedicatedFullReplacementRun({
      adminId: "admin-1",
      status: "RUNNING",
      operationType: "COMMON_TEMPORARY_PASSWORD",
    }, "admin-1")).toBe(false);
    expect(isDedicatedFullReplacementRun({
      adminId: "admin-1",
      status: "RUNNING",
      operationType: "FULL_REPLACEMENT",
    }, "admin-1")).toBe(true);
  });

  it("rejects a historical common run through the full replacement path", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    fake.runs.set("historical-common-run", {
      id: "historical-common-run",
      adminId: "admin-1",
      operationType: "COMMON_TEMPORARY_PASSWORD",
      status: "FAILED",
      totalEligible: 1,
      adminCount: 2,
      processedCount: 0,
      failedCount: 1,
      activeLockKey: null,
    });

    await expect(executeFullReplacementPasswordReset(
      "admin-1",
      { ...validReplacementInput(1), runId: "historical-common-run" },
      fake.dependencies,
    )).rejects.toMatchObject({ code: "FULL_REPLACEMENT_OPERATION_MISMATCH" });
    expect(fake.db.user.update).not.toHaveBeenCalled();
  });

  it("moves an unexpectedly exited full worker to FAILED without advancing its checkpoint", async () => {
    const run = {
      adminId: "admin-1",
      operationType: "FULL_REPLACEMENT",
      status: "RUNNING",
      processedCount: 250,
      totalEligible: 500,
      activeLockKey: "FULL_REPLACEMENT_PASSWORD_RESET",
    };
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const adminLog = vi.fn(async () => ({ id: "log-1" }));
    const db = {
      commonTemporaryPasswordResetRun: {
        findUnique: vi.fn(async () => run),
        updateMany,
      },
      adminLog: { create: adminLog },
    } as any;

    await recoverUnexpectedFullReplacementWorkerExit(db, "full-run-1");

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "RUNNING",
        activeLockKey: "FULL_REPLACEMENT_PASSWORD_RESET",
      }),
      data: expect.objectContaining({
        status: "FAILED",
        failureReason: FULL_REPLACEMENT_WORKER_EXIT_FAILURE_REASON,
        activeLockKey: null,
      }),
    }));
    expect((updateMany.mock.calls as any[])[0]?.[0]?.data.processedCount).toBeUndefined();
    expect(adminLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "FULL_REPLACEMENT_PASSWORD_RESET_FAILED",
      }),
    }));
    expect(JSON.stringify(adminLog.mock.calls)).not.toContain("Replacement-Temporary-73!");
  });

  it("contains child IPC send failures without throwing and invokes recovery", () => {
    const onFailure = vi.fn();
    const child = {
      send: vi.fn(() => {
        throw new Error("Replacement-Temporary-73!");
      }),
    } as unknown as FullReplacementWorkerIpcChild;

    expect(() => sendFullReplacementWorkerMessage(
      child,
      {
        runId: "full-run-1",
        adminId: "admin-1",
        password: "Replacement-Temporary-73!",
      },
      onFailure,
    )).not.toThrow();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("resumes a partial full replacement only with the same password", async () => {
    const fake = createFakeDependencies(
      [createUser("1"), createUser("2"), createUser("3")],
      false,
      1,
    );
    const first = await executeFullReplacementPasswordReset(
      "admin-1",
      validReplacementInput(3),
      fake.dependencies,
    );
    const failed = await waitForCompletion(fake, first.runId);
    expect(failed.status).toBe("FAILED");
    expect(fake.rows.get("1")?.authVersion).toBe(1);

    fake.setFailureAfterUpdates(null);
    const resumed = await executeFullReplacementPasswordReset(
      "admin-1",
      { ...validReplacementInput(3), runId: first.runId },
      fake.dependencies,
    );
    const completed = await waitForCompletion(fake, resumed.runId);
    expect(completed.status).toBe("COMPLETED");
    expect(fake.rows.get("1")?.authVersion).toBe(1);
    expect(fake.rows.get("2")?.authVersion).toBe(1);
    expect(fake.rows.get("3")?.authVersion).toBe(1);
  });

  it("rejects a resumed full replacement with a different password before changing users", async () => {
    const fake = createFakeDependencies([createUser("1"), createUser("2")], false, 1);
    const first = await executeFullReplacementPasswordReset(
      "admin-1",
      validReplacementInput(2),
      fake.dependencies,
    );
    await waitForCompletion(fake, first.runId);
    const before = fake.rows.get("2")?.authVersion;

    const wrong = {
      ...validReplacementInput(2),
      password: "Different-Temporary-99!",
      confirmPassword: "Different-Temporary-99!",
      runId: first.runId,
    };
    const resumed = await executeFullReplacementPasswordReset("admin-1", wrong, fake.dependencies);
    const failed = await waitForCompletion(fake, resumed.runId);

    expect(failed.status).toBe("FAILED");
    expect(fake.rows.get("2")?.authVersion).toBe(before);
    expect(failed.failureReason).toContain("Full replacement password reset stopped");
    expect(failed.failureReason).not.toContain("Different-Temporary-99!");
  });

  it("does not let the failed common run block a distinct full replacement preview", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    fake.runs.set("old-common-run", {
      id: "old-common-run",
      adminId: "admin-1",
      operationType: "COMMON_TEMPORARY_PASSWORD",
      status: "FAILED",
      totalEligible: 1,
      adminCount: 2,
      processedCount: 1,
      failedCount: 1,
      lastUserId: "1",
      failureReason: "historical failure",
      workerLeaseUntil: null,
      lastHeartbeatAt: new Date(),
      activeLockKey: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(getFullReplacementPasswordResetPreview(fake.dependencies)).resolves.toMatchObject({
      eligibleToExecute: true,
      resumableRun: null,
      totalNormalUsers: 1,
    });
  });

  it("retries transient P1001 failures with bounded backoff", async () => {
    const transient = Object.assign(new Error("database connection timed out"), { code: "P1001" });
    const fake = createFakeDependencies([createUser("1")], false, 0, undefined, transient);
    const sleeps: number[] = [];
    fake.dependencies.sleep = async (milliseconds) => {
      sleeps.push(milliseconds);
    };

    const result = await executeCommonPasswordReset("admin-1", validInput(1), fake.dependencies);
    const completed = await waitForCompletion(fake, result.runId);

    expect(completed.status).toBe("COMPLETED");
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps.length).toBeLessThanOrEqual(3);
    expect(sleeps.every((milliseconds) => milliseconds > 0)).toBe(true);
  });

  it("rejects weak or mismatched credentials before creating a run", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    await expect(executeCommonPasswordReset(
      "admin-1",
      { ...validInput(1), password: "weak", confirmPassword: "weak" },
      fake.dependencies,
    )).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    await expect(executeCommonPasswordReset(
      "admin-1",
      { ...validInput(1), confirmPassword: "different" },
      fake.dependencies,
    )).rejects.toMatchObject({ code: "PASSWORD_CONFIRMATION_MISMATCH" });
    expect(fake.runs.size).toBe(0);
  });

  it("refuses execution while the existing random reset is active", async () => {
    const fake = createFakeDependencies([createUser("1")], true);
    await expect(executeCommonPasswordReset(
      "admin-1",
      validInput(1),
      fake.dependencies,
    )).rejects.toMatchObject({ code: "BULK_RESET_ALREADY_RUNNING" });
    expect(fake.rows.get("1")?.authVersion).toBe(0);
  });

  it("returns the latest failed run as resumable and blocks creating a new run", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    const failedRun = {
      id: "cmua3jcec001wa99zi17pz3hl",
      adminId: "admin-1",
      status: "FAILED",
      totalEligible: 1,
      adminCount: 2,
      processedCount: 1,
      failedCount: 1,
      lastUserId: "1",
      failureReason: "Common password reset worker lease expired",
      workerLeaseUntil: null,
      lastHeartbeatAt: new Date("2026-09-20T18:20:14.164Z"),
      activeLockKey: null,
      startedAt: new Date("2026-09-20T17:34:43.333Z"),
      completedAt: null,
      createdAt: new Date("2026-09-20T17:34:43.333Z"),
      updatedAt: new Date("2026-09-20T19:27:24.275Z"),
    };
    fake.runs.set(failedRun.id, failedRun);

    await expect(getCommonPasswordResetPreview(fake.dependencies)).resolves.toMatchObject({
      activeCredentialReset: false,
      eligibleToExecute: false,
      activeRun: null,
      resumableRun: {
        runId: failedRun.id,
        status: "FAILED",
        processedCount: 1,
        totalEligible: 1,
        lastUserId: "1",
      },
    });

    await expect(executeCommonPasswordReset(
      "admin-1",
      validInput(1),
      fake.dependencies,
    )).rejects.toMatchObject({ code: "COMMON_RESET_RESUME_REQUIRED" });
    expect(fake.db.commonTemporaryPasswordResetRun.create).not.toHaveBeenCalled();
  });

  it("only resumes the failed run explicitly named by the caller", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    fake.runs.set("failed-run-1", {
      id: "failed-run-1",
      adminId: "admin-1",
      status: "FAILED",
      totalEligible: 1,
      adminCount: 2,
      processedCount: 1,
      failedCount: 1,
      lastUserId: "1",
      failureReason: "worker lost",
      workerLeaseUntil: null,
      lastHeartbeatAt: new Date(),
      activeLockKey: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(executeCommonPasswordReset(
      "admin-1",
      { ...validInput(1), runId: "different-run" },
      fake.dependencies,
    )).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.db.commonTemporaryPasswordResetRun.create).not.toHaveBeenCalled();
  });

  it("checkpoints across multiple batches", async () => {
    const users = Array.from({ length: 251 }, (_, index) =>
      createUser(String(index).padStart(3, "0")),
    );
    const fake = createFakeDependencies(users);
    const result = await executeCommonPasswordReset(
      "admin-1",
      validInput(users.length),
      fake.dependencies,
    );
    const run = await waitForCompletion(fake, result.runId);

    expect(run.status).toBe("COMPLETED");
    expect(run.processedCount).toBe(251);
    expect(fake.db.commonTemporaryPasswordResetRun.update.mock.calls.some(
      ([args]: [{ data?: { lastUserId?: string } }]) => args.data?.lastUserId === "249",
    )).toBe(true);
  });

  it("resumes a partially applied batch without double-counting", async () => {
    const fake = createFakeDependencies(
      [createUser("1"), createUser("2"), createUser("3")],
      false,
      1,
    );
    const first = await executeCommonPasswordReset(
      "admin-1",
      validInput(3),
      fake.dependencies,
    );
    const failed = await waitForCompletion(fake, first.runId);
    expect(failed.status).toBe("FAILED");
    expect(failed.processedCount).toBe(0);
    expect(fake.rows.get("1")?.authVersion).toBe(1);

    fake.setFailureAfterUpdates(null);
    const resumed = await executeCommonPasswordReset(
      "admin-1",
      { ...validInput(3), runId: first.runId },
      fake.dependencies,
    );
    const completed = await waitForCompletion(fake, resumed.runId);
    expect(completed.status).toBe("COMPLETED");
    expect(completed.processedCount).toBe(3);
    expect(fake.rows.get("1")?.authVersion).toBe(1);
    expect(fake.rows.get("2")?.authVersion).toBe(1);
    expect(fake.rows.get("3")?.authVersion).toBe(1);
  });

  it("resumes from a 2000-user checkpoint without mutating 37 already-committed users", async () => {
    const users = Array.from({ length: 2040 }, (_, index) =>
      createUser(String(index).padStart(4, "0")),
    );
    const fake = createFakeDependencies(users);
    const originalPasswordHash = bcrypt.hashSync("Common-Temporary-42!", 4);
    const checkpointStartedAt = new Date("2026-09-20T17:34:43.333Z");

    for (let index = 2000; index <= 2037; index += 1) {
      const user = fake.rows.get(String(index).padStart(4, "0"));
      if (!user) throw new Error(`missing fixture user ${index}`);
      user.passwordHash = originalPasswordHash;
      user.authVersion = 1;
      user.passwordResetRequired = true;
      user.passwordChangedAt = new Date("2026-09-21T02:30:12.895Z");
    }

    const runId = "checkpoint-2000-run";
    fake.runs.set(runId, {
      id: runId,
      adminId: "admin-1",
      status: "FAILED",
      totalEligible: users.length,
      adminCount: 2,
      processedCount: 2000,
      failedCount: 1,
      lastUserId: "1999",
      failureReason: "Common temporary password reset stopped in batch 8",
      workerLeaseUntil: null,
      lastHeartbeatAt: new Date("2026-09-21T02:30:12.303Z"),
      activeLockKey: null,
      startedAt: checkpointStartedAt,
      completedAt: null,
      createdAt: checkpointStartedAt,
      updatedAt: new Date("2026-09-21T02:30:14.504Z"),
    });

    const result = await executeCommonPasswordReset(
      "admin-1",
      { ...validInput(users.length), runId },
      fake.dependencies,
    );
    const completed = await waitForCompletion(fake, result.runId);

    expect(completed).toMatchObject({
      status: "COMPLETED",
      processedCount: 2040,
      lastUserId: "2039",
    });
    expect(fake.db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { gt: "1999" } },
    }));

    const userUpdates = fake.db.user.update.mock.calls
      .map(([args]: [{ where: { id: string } }]) => args.where.id);
    expect(userUpdates).toEqual(["2038", "2039"]);
    for (let index = 2000; index <= 2037; index += 1) {
      const user = fake.rows.get(String(index).padStart(4, "0"));
      expect(user?.passwordHash).toBe(originalPasswordHash);
      expect(user?.authVersion).toBe(1);
    }
  });

  it("persists sanitized failure diagnostics without sensitive error details", async () => {
    const fake = createFakeDependencies(
      [createUser("1")],
      false,
      0,
      undefined,
      new Error("password=Common-Temporary-42! token=secret-value"),
    );
    const result = await executeCommonPasswordReset(
      "admin-1",
      validInput(1),
      fake.dependencies,
    );
    const failed = await waitForCompletion(fake, result.runId);
    const failureLog = fake.logs.find((log) => log.action === "COMMON_TEMPORARY_PASSWORD_RESET_FAILED");

    expect(failed.failureReason).toContain("[Error]: Sensitive error details redacted");
    expect(failureLog?.details).toMatchObject({
      diagnostic: {
        type: "Error",
        code: null,
        message: "Sensitive error details redacted",
      },
    });
    expect(JSON.stringify(failed)).not.toContain("Common-Temporary-42!");
    expect(JSON.stringify(fake.logs)).not.toContain("secret-value");
  });

  it("bounds concurrent bcrypt work and never sends the plaintext to persistence or logs", async () => {
    const fake = createFakeDependencies(
      Array.from({ length: 12 }, (_, index) => createUser(String(index).padStart(3, "0"))),
    );
    let activeBcryptCalls = 0;
    let maxBcryptCalls = 0;
    const trackBcryptCall = async <T>(result: T): Promise<T> => {
      activeBcryptCalls += 1;
      maxBcryptCalls = Math.max(maxBcryptCalls, activeBcryptCalls);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeBcryptCalls -= 1;
      return result;
    };

    vi.spyOn(bcrypt, "compare").mockImplementation(async () => trackBcryptCall(false));
    vi.spyOn(bcrypt, "hash").mockImplementation(async () => trackBcryptCall("replacement-hash"));

    const result = await executeCommonPasswordReset(
      "admin-1",
      validInput(12),
      fake.dependencies,
    );
    const completed = await waitForCompletion(fake, result.runId);

    expect(completed.status).toBe("COMPLETED");
    expect(maxBcryptCalls).toBeGreaterThan(1);
    expect(maxBcryptCalls).toBeLessThanOrEqual(4);

    const persistedCalls = [
      ...fake.db.user.update.mock.calls,
      ...fake.db.commonTemporaryPasswordResetRun.update.mock.calls,
      ...fake.db.adminLog.create.mock.calls,
    ];
    expect(JSON.stringify(persistedCalls)).not.toContain("Common-Temporary-42!");
    expect(JSON.stringify(fake.logs)).not.toContain("Common-Temporary-42!");
  });

  it("preserves a completed checkpoint and resumes after it", async () => {
    const users = Array.from({ length: 251 }, (_, index) =>
      createUser(String(index).padStart(3, "0")),
    );
    const fake = createFakeDependencies(users, false, 250);

    const first = await executeCommonPasswordReset(
      "admin-1",
      validInput(users.length),
      fake.dependencies,
    );
    const failed = await waitForCompletion(fake, first.runId);

    expect(failed.status).toBe("FAILED");
    expect(failed.processedCount).toBe(250);
    expect(failed.lastUserId).toBe("249");
    expect(fake.rows.get("000")?.authVersion).toBe(1);
    expect(fake.rows.get("249")?.authVersion).toBe(1);
    expect(fake.rows.get("250")?.authVersion).toBe(0);

    fake.setFailureAfterUpdates(null);
    const resumed = await executeCommonPasswordReset(
      "admin-1",
      { ...validInput(users.length), runId: first.runId },
      fake.dependencies,
    );
    expect(fake.db.commonTemporaryPasswordResetRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: first.runId, status: "FAILED", activeLockKey: null },
        data: expect.objectContaining({
          status: "RUNNING",
          activeLockKey: "COMMON_TEMPORARY_PASSWORD_RESET",
        }),
      }),
    );
    expect(fake.db.user.findMany.mock.calls.some(
      ([args]: [{ where?: { id?: { gt?: string } } }]) => args.where?.id?.gt === "249",
    )).toBe(true);
    const completed = await waitForCompletion(fake, resumed.runId);

    expect(completed.status).toBe("COMPLETED");
    expect(completed.processedCount).toBe(251);
    expect(fake.rows.get("000")?.authVersion).toBe(1);
    expect(fake.rows.get("249")?.authVersion).toBe(1);
    expect(fake.rows.get("250")?.authVersion).toBe(1);
  });

  it("stops only at a safe worker boundary and preserves the durable checkpoint", async () => {
    const fake = createFakeDependencies(
      [createUser("1")],
      false,
      null,
      COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID,
    );
    const started = await executeCommonPasswordReset(
      "admin-1",
      validInput(1),
      fake.dependencies,
    );

    const stopped = await requestCommonPasswordResetEmergencyStop(
      "super-admin-1",
      started.runId,
      fake.dependencies,
    );

    expect(stopped).toMatchObject({
      runId: COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID,
      status: "FAILED",
      processedCount: 0,
      failedCount: 1,
      failureReason: COMMON_PASSWORD_RESET_EMERGENCY_STOP_REASON,
    });
    expect(fake.rows.get("1")?.authVersion).toBe(0);
    expect(fake.logs.at(-1)).toMatchObject({
      action: "COMMON_TEMPORARY_PASSWORD_RESET_ADMIN_STOPPED",
    });
  });

  it("rejects emergency stop for any other run", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    await expect(requestCommonPasswordResetEmergencyStop(
      "super-admin-1",
      "common-run-1",
      fake.dependencies,
    )).rejects.toMatchObject({ code: "COMMON_RESET_EMERGENCY_RUN_NOT_FOUND" });
  });

  it("recovers only the stranded target run without changing users or the durable checkpoint", async () => {
    const fake = createFakeDependencies([createUser("1")]);
    const strandedRun = {
      id: COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID,
      adminId: "admin-1",
      status: "RUNNING",
      totalEligible: 6640,
      adminCount: 2,
      processedCount: 250,
      failedCount: 0,
      lastUserId: "checkpoint-user-250",
      failureReason: null,
      workerLeaseUntil: new Date(Date.now() - 1_000),
      lastHeartbeatAt: new Date(Date.now() - 61_000),
      activeLockKey: "COMMON_TEMPORARY_PASSWORD_RESET",
      startedAt: new Date("2026-09-20T17:34:43.333Z"),
      completedAt: null,
      createdAt: new Date("2026-09-20T17:34:43.333Z"),
      updatedAt: new Date("2026-09-20T18:20:14.165Z"),
    };
    fake.runs.set(strandedRun.id, strandedRun);

    const recovered = await recoverStrandedCommonPasswordResetRun(
      "super-admin-1",
      strandedRun.id,
      fake.dependencies,
    );

    expect(recovered).toMatchObject({
      runId: COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID,
      status: "FAILED",
      processedCount: 250,
      totalEligible: 6640,
      failedCount: 1,
      lastUserId: "checkpoint-user-250",
      failureReason: COMMON_PASSWORD_RESET_WORKER_PROCESS_LOST_REASON,
    });
    expect(strandedRun.activeLockKey).toBeNull();
    expect(strandedRun.workerLeaseUntil).toBeNull();
    expect(fake.db.user.update).not.toHaveBeenCalled();
    expect(fake.logs.at(-1)).toMatchObject({
      action: "COMMON_TEMPORARY_PASSWORD_RESET_WORKER_LOST_RECOVERED",
    });
  });
});