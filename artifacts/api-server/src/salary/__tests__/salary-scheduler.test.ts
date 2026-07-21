/**
 * Sprint 33G — Salary Qualification Scheduler Tests
 *
 * 10 scenarios:
 *  1.  Incremental qualification — single affected user.
 *  2.  Nightly batch — processes all active users.
 *  3.  Failure isolation — one user throws, others continue.
 *  4.  Reconciliation — updates lastReconciledAt.
 *  5.  Duplicate nightly run — no duplicate achievements.
 *  6.  Duplicate reconciliation — no duplicate achievements.
 *  7.  Metrics returned correctly.
 *  8.  Batch processing — multiple workers, all users processed.
 *  9.  Large user set — pagination used, memory bounded.
 * 10.  Single user rebuild — returns expected summary.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock("../../config/env", () => ({
  env: {
    DATABASE_URL:   "postgresql://test:test@localhost/test",
    JWT_SECRET:     "test-secret",
    SESSION_SECRET: "test-session",
    NODE_ENV:       "test",
    PORT:           "5000",
  },
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn() },
    salaryBusinessSummary: { update: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("../../lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  },
}));

// runQualificationForUser is the only function from the qualification service
// we need to mock — we test the scheduler's orchestration, not its inner logic.
vi.mock("../salary-qualification.service", () => ({
  runQualificationForUser: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import {
  evaluateUser,
  rebuildUser,
  runNightlyQualification,
  runReconciliation,
} from "../salary-scheduler.service";
import { prisma } from "../../config/prisma";
import { logger } from "../../lib/logger";
import { runQualificationForUser } from "../salary-qualification.service";

// ── Helpers ────────────────────────────────────────────────────────────────────

type PrismaMock = {
  user:                  { findMany: ReturnType<typeof vi.fn> };
  salaryBusinessSummary: { update:   ReturnType<typeof vi.fn> };
};

type QualMock = ReturnType<typeof vi.fn>;

const qualMock = runQualificationForUser as QualMock;

/** Default successful qualification result */
const OK_RESULT = { userId: "", created: 1, duplicate: 0, insufficient: 0 };

/** Make a fake user list for prisma.user.findMany */
function makeUsers(ids: string[]): Array<{ id: string }> {
  return ids.map((id) => ({ id }));
}

/**
 * Set up prisma.user.findMany to return one page containing all users,
 * then an empty page to terminate pagination.
 */
function mockUsersOnePage(ids: string[]) {
  (prisma as unknown as PrismaMock).user.findMany
    .mockResolvedValueOnce(makeUsers(ids))
    .mockResolvedValue([]);   // subsequent calls return empty = no more pages
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("salary-scheduler.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    qualMock.mockResolvedValue({ ...OK_RESULT });
    (prisma as unknown as PrismaMock).salaryBusinessSummary.update.mockResolvedValue({});
  });

  // ── Test 1 ───────────────────────────────────────────────────────────────────

  it("1. incremental qualification qualifies exactly the affected user", async () => {
    const result = await evaluateUser("user-42");

    expect(qualMock).toHaveBeenCalledTimes(1);
    expect(qualMock).toHaveBeenCalledWith("user-42");

    expect(result.created).toBe(1);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-42" }),
      expect.stringContaining("incremental qualification started"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-42" }),
      expect.stringContaining("incremental qualification completed"),
    );
  });

  // ── Test 2 ───────────────────────────────────────────────────────────────────

  it("2. nightly batch processes all active users", async () => {
    mockUsersOnePage(["u1", "u2", "u3"]);

    const metrics = await runNightlyQualification({ concurrency: 2, pageSize: 100 });

    expect(qualMock).toHaveBeenCalledTimes(3);
    expect(qualMock).toHaveBeenCalledWith("u1");
    expect(qualMock).toHaveBeenCalledWith("u2");
    expect(qualMock).toHaveBeenCalledWith("u3");

    expect(metrics.usersProcessed).toBe(3);
    expect(metrics.usersSucceeded).toBe(3);
    expect(metrics.usersFailed).toBe(0);
  });

  // ── Test 3 ───────────────────────────────────────────────────────────────────

  it("3. failure isolation — one user throws, others continue processing", async () => {
    mockUsersOnePage(["u1", "u2", "u3"]);

    qualMock
      .mockResolvedValueOnce({ ...OK_RESULT, userId: "u1" })
      .mockRejectedValueOnce(new Error("DB timeout for u2"))
      .mockResolvedValueOnce({ ...OK_RESULT, userId: "u3" });

    const metrics = await runNightlyQualification({ concurrency: 1, pageSize: 100 });

    expect(metrics.usersProcessed).toBe(3);
    expect(metrics.usersSucceeded).toBe(2);
    expect(metrics.usersFailed).toBe(1);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u2" }),
      expect.stringContaining("user failed"),
    );
  });

  // ── Test 4 ───────────────────────────────────────────────────────────────────

  it("4. reconciliation updates lastReconciledAt for each successful user", async () => {
    mockUsersOnePage(["u1", "u2"]);

    await runReconciliation({ concurrency: 1, pageSize: 100 });

    expect((prisma as unknown as PrismaMock).salaryBusinessSummary.update)
      .toHaveBeenCalledTimes(2);

    expect((prisma as unknown as PrismaMock).salaryBusinessSummary.update)
      .toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: "u1" },
        data:  expect.objectContaining({ lastReconciledAt: expect.any(Date) }),
      }));

    expect((prisma as unknown as PrismaMock).salaryBusinessSummary.update)
      .toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: "u2" },
        data:  expect.objectContaining({ lastReconciledAt: expect.any(Date) }),
      }));
  });

  // ── Test 5 ───────────────────────────────────────────────────────────────────

  it("5. duplicate nightly run produces no duplicate achievements", async () => {
    // First run: 2 new achievements per user
    qualMock.mockResolvedValueOnce({ ...OK_RESULT, created: 2, duplicate: 0 });

    mockUsersOnePage(["u1"]);
    const first = await runNightlyQualification({ concurrency: 1, pageSize: 100 });
    expect(first.newAchievementsCreated).toBe(2);

    // Second run: achievements already exist → 0 new, 2 duplicate
    qualMock.mockResolvedValueOnce({ ...OK_RESULT, created: 0, duplicate: 2 });

    mockUsersOnePage(["u1"]);
    const second = await runNightlyQualification({ concurrency: 1, pageSize: 100 });
    expect(second.newAchievementsCreated).toBe(0);
    expect(second.duplicatesSkipped).toBe(2);
  });

  // ── Test 6 ───────────────────────────────────────────────────────────────────

  it("6. duplicate reconciliation produces no duplicate achievements", async () => {
    qualMock.mockResolvedValueOnce({ ...OK_RESULT, created: 1, duplicate: 0 });
    mockUsersOnePage(["u1"]);
    const first = await runReconciliation({ concurrency: 1, pageSize: 100 });
    expect(first.newAchievementsCreated).toBe(1);

    qualMock.mockResolvedValueOnce({ ...OK_RESULT, created: 0, duplicate: 1 });
    mockUsersOnePage(["u1"]);
    const second = await runReconciliation({ concurrency: 1, pageSize: 100 });
    expect(second.newAchievementsCreated).toBe(0);
    expect(second.duplicatesSkipped).toBe(1);
  });

  // ── Test 7 ───────────────────────────────────────────────────────────────────

  it("7. metrics are accumulated correctly across all users", async () => {
    mockUsersOnePage(["u1", "u2", "u3"]);

    // u1: creates 2, u2: 1 duplicate, u3: fails
    qualMock
      .mockResolvedValueOnce({ ...OK_RESULT, userId: "u1", created: 2, duplicate: 0 })
      .mockResolvedValueOnce({ ...OK_RESULT, userId: "u2", created: 0, duplicate: 3 })
      .mockRejectedValueOnce(new Error("u3 failed"));

    const metrics = await runNightlyQualification({ concurrency: 1, pageSize: 100 });

    expect(metrics.usersProcessed).toBe(3);
    expect(metrics.usersSucceeded).toBe(2);
    expect(metrics.usersFailed).toBe(1);
    expect(metrics.newAchievementsCreated).toBe(2);   // only from u1
    expect(metrics.duplicatesSkipped).toBe(3);        // only from u2
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof metrics.durationMs).toBe("number");
  });

  // ── Test 8 ───────────────────────────────────────────────────────────────────

  it("8. batch processing with multiple workers processes all users", async () => {
    const userIds = Array.from({ length: 20 }, (_, i) => `u${i + 1}`);
    mockUsersOnePage(userIds);
    qualMock.mockResolvedValue({ ...OK_RESULT, created: 0, duplicate: 1 });

    const metrics = await runNightlyQualification({ concurrency: 5, pageSize: 100 });

    expect(qualMock).toHaveBeenCalledTimes(20);
    expect(metrics.usersProcessed).toBe(20);
    expect(metrics.usersSucceeded).toBe(20);
    expect(metrics.duplicatesSkipped).toBe(20);
  });

  // ── Test 9 ───────────────────────────────────────────────────────────────────

  it("9. large user set uses cursor pagination — findMany called once per page", async () => {
    // pageSize=5; return 3 full pages then an empty terminator
    // total = 15 users, findMany called 4 times (3 full + 1 empty)
    const page1 = makeUsers(["u1",  "u2",  "u3",  "u4",  "u5"]);
    const page2 = makeUsers(["u6",  "u7",  "u8",  "u9",  "u10"]);
    const page3 = makeUsers(["u11", "u12", "u13", "u14", "u15"]);

    (prisma as unknown as PrismaMock).user.findMany
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page3)
      .mockResolvedValue([]);   // page4 = empty → stop

    qualMock.mockResolvedValue({ ...OK_RESULT });

    const metrics = await runNightlyQualification({ concurrency: 3, pageSize: 5 });

    // DB fetched in pages
    expect((prisma as unknown as PrismaMock).user.findMany).toHaveBeenCalledTimes(4);

    // All 15 users processed
    expect(metrics.usersProcessed).toBe(15);
    expect(qualMock).toHaveBeenCalledTimes(15);

    // Cursor forwarding: second call should include a cursor
    const secondCall = (prisma as unknown as PrismaMock).user.findMany.mock.calls[1][0];
    expect(secondCall).toHaveProperty("cursor");
    expect(secondCall.cursor).toEqual({ id: "u5" });

    // Third call uses the last ID of page 2
    const thirdCall = (prisma as unknown as PrismaMock).user.findMany.mock.calls[2][0];
    expect(thirdCall.cursor).toEqual({ id: "u10" });
  });

  // ── Test 10 ──────────────────────────────────────────────────────────────────

  it("10. single user rebuild returns the qualification result", async () => {
    const expected = {
      userId:       "user-99",
      created:      3,
      duplicate:    1,
      insufficient: 2,
    };
    qualMock.mockResolvedValue(expected);

    const result = await rebuildUser("user-99");

    expect(qualMock).toHaveBeenCalledTimes(1);
    expect(qualMock).toHaveBeenCalledWith("user-99");
    expect(result).toEqual(expected);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-99" }),
      expect.stringContaining("single-user rebuild started"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-99" }),
      expect.stringContaining("single-user rebuild completed"),
    );
  });

  // ── Bonus: nightly does NOT update lastReconciledAt ──────────────────────────

  it("bonus: nightly qualification never updates lastReconciledAt", async () => {
    mockUsersOnePage(["u1", "u2"]);

    await runNightlyQualification({ concurrency: 1, pageSize: 100 });

    expect(
      (prisma as unknown as PrismaMock).salaryBusinessSummary.update,
    ).not.toHaveBeenCalled();
  });
});
