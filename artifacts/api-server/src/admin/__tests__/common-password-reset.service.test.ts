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
  executeCommonPasswordReset,
  getCommonPasswordResetPreview,
} from "../common-password-reset.service";
import {
  COMMON_PASSWORD_RESET_CONFIRMATION,
  type CommonPasswordResetExecuteInput,
} from "../common-password-reset.schema";
import type { CommonPasswordResetDependencies } from "../common-password-reset.service";

type FakeUser = {
  id: string;
  passwordHash: string;
  authVersion: number;
  passwordResetRequired: boolean;
  passwordChangedAt: Date | null;
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
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    status,
  };
}

function createFakeDependencies(
  users: FakeUser[],
  activeRandomRun = false,
  initialFailureAfterUpdates: number | null = null,
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
      findMany: vi.fn(async (args: { where?: { id?: { gt: string } }; take: number }) => {
        const cursor = args.where?.id?.gt;
        return [...rows.values()]
          .filter((user) => !cursor || user.id > cursor)
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, args.take)
          .map((user) => ({ ...user }));
      }),
      update: vi.fn(async (args: { where: { id: string }; data: any }) => {
        const user = rows.get(args.where.id);
        if (!user) throw new Error("user missing");
        if (failureAfterUpdates === 0) {
          failureAfterUpdates = null;
          throw new Error("simulated user update interruption");
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
        return [...runs.values()].find((run) =>
          args.where.status.in.includes(run.status),
        ) ?? null;
      }),
      findUnique: vi.fn(async (args: any) => runs.get(args.where.id) ?? null),
      findUniqueOrThrow: vi.fn(async (args: any) => {
        const run = runs.get(args.where.id);
        if (!run) throw new Error("run missing");
        return run;
      }),
      create: vi.fn(async (args: any) => {
        const run = {
          id: `common-run-${++sequence}`,
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
    }
    expect(fake.rows.get("2")?.status).toBe("BLOCKED");
    expect(fake.rows.get("3")?.status).toBe("SUSPENDED");

    const serialized = JSON.stringify({ runs: [...fake.runs.values()], logs: fake.logs });
    expect(serialized).not.toContain("Common-Temporary-42!");
    expect(serialized).not.toContain("$2");
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
    const completed = await waitForCompletion(fake, resumed.runId);

    expect(completed.status).toBe("COMPLETED");
    expect(completed.processedCount).toBe(251);
    expect(fake.rows.get("000")?.authVersion).toBe(1);
    expect(fake.rows.get("249")?.authVersion).toBe(1);
    expect(fake.rows.get("250")?.authVersion).toBe(1);
  });
});