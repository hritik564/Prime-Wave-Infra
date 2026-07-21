/**
 * Sprint 33H — Monthly Salary Generation Engine Tests
 *
 * 14 scenarios:
 *  1.  Qualified Bronze → salary generated.
 *  2.  Qualified Ruby   → Ruby salary generated.
 *  3.  Multiple ranks   → only the highest is used.
 *  4.  Inactive user    → skipped.
 *  5.  No achievements  → skipped.
 *  6.  Salary = 0       → skipped.
 *  7.  Duplicate run    → no duplicate salary.
 *  8.  Tx rollback      → no partial SalaryIncome.
 *  9.  Batch generation → multiple users processed.
 * 10.  Failure isolation → one user fails, others continue.
 * 11.  Metrics verified.
 * 12.  Snapshot rule — promotion after generation doesn't alter existing record.
 * 13.  Historical month regeneration → duplicate prevented.
 * 14.  Concurrency → multiple workers, all users processed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma }                                from "@prisma/client";

// ── Module mocks ──────────────────────────────────────────────────────────────

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
    user:              { findUnique: vi.fn(), findMany: vi.fn() },
    salaryIncome:      { findUnique: vi.fn(), create: vi.fn() },
    salaryAchievement: { findMany: vi.fn() },
    $transaction:      vi.fn(),
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

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  generateMonthlySalary,
  generateMonthlyBatch,
  type GenerateResult,
} from "../salary-income.service";
import { prisma } from "../../config/prisma";
import { logger } from "../../lib/logger";

// ── Helpers ───────────────────────────────────────────────────────────────────

type PrismaMock = {
  user:              { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  salaryIncome:      { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  salaryAchievement: { findMany:   ReturnType<typeof vi.fn> };
  $transaction:      ReturnType<typeof vi.fn>;
};

const pm = () => prisma as unknown as PrismaMock;

/** A fake SalaryAchievement row including joined config */
function makeAchievement(rankName: string, monthlySalary: string, requiredBusiness: string) {
  return {
    id:           `ach-${rankName}`,
    userId:       "user-1",
    rankName,
    achievedAt:   new Date(),
    expiresAt:    new Date(Date.now() + 1e10),
    monthlyAmount: new Prisma.Decimal(monthlySalary),
    isActive:     true,
    paymentsMade: 0,
    lastPaidAt:   null,
    createdAt:    new Date(),
    config: {
      monthlySalary:    new Prisma.Decimal(monthlySalary),
      requiredBusiness: new Prisma.Decimal(requiredBusiness),
    },
  };
}

/** Mock tx object passed into $transaction callbacks */
const mockTx = {
  salaryIncome: {
    findUnique: vi.fn(),
    create:     vi.fn(),
  },
  salaryAchievement: {
    findMany: vi.fn(),
  },
};

/** Wire $transaction to call fn(mockTx) immediately */
function setupTx() {
  pm().$transaction.mockImplementation(
    async (fn: (tx: typeof mockTx) => Promise<GenerateResult>) => fn(mockTx),
  );
}

/** Simulate an ACTIVE user */
function setActiveUser(userId = "user-1") {
  pm().user.findUnique.mockResolvedValue({ id: userId, status: "ACTIVE" });
}

/** Simulate no existing income (fresh month) */
function noExistingIncome() {
  mockTx.salaryIncome.findUnique.mockResolvedValue(null);
}

/** Simulate a successful income creation */
function mockIncomeCreate(rankName: string, amount: string) {
  mockTx.salaryIncome.create.mockResolvedValue({
    id:        "income-1",
    userId:    "user-1",
    rankName,
    month:     7,
    year:      2026,
    amount:    new Prisma.Decimal(amount),
    status:    "PENDING",
    reference: "salary-user-1-2026-07",
    createdAt: new Date(),
  });
}

/** Set up prisma.user.findMany for batch tests */
function mockUsersOnePage(ids: string[]) {
  pm().user.findMany
    .mockResolvedValueOnce(ids.map((id) => ({ id })))
    .mockResolvedValue([]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("salary-income.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTx();
  });

  // ── Test 1 ───────────────────────────────────────────────────────────────────

  it("1. generates salary for a qualified Bronze member", async () => {
    setActiveUser();
    noExistingIncome();
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500", "5000"),
    ]);
    mockIncomeCreate("Bronze", "500");

    const result = await generateMonthlySalary("user-1", 7, 2026);

    expect(result.status).toBe("generated");
    if (result.status === "generated") {
      expect(result.rankName).toBe("Bronze");
      expect(result.amount.toFixed(2)).toBe("500.00");
    }

    expect(mockTx.salaryIncome.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId:   "user-1",
          rankName: "Bronze",
          month:    7,
          year:     2026,
          status:   "PENDING",
        }),
      }),
    );
  });

  // ── Test 2 ───────────────────────────────────────────────────────────────────

  it("2. generates Ruby salary for a Ruby-qualified member", async () => {
    setActiveUser();
    noExistingIncome();
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Ruby", "4000", "100000"),
    ]);
    mockIncomeCreate("Ruby", "4000");

    const result = await generateMonthlySalary("user-1", 7, 2026);

    expect(result.status).toBe("generated");
    if (result.status === "generated") {
      expect(result.rankName).toBe("Ruby");
      expect(result.amount.toFixed(2)).toBe("4000.00");
    }
  });

  // ── Test 3 ───────────────────────────────────────────────────────────────────

  it("3. multiple ranks held — only the highest-ranked salary is generated", async () => {
    setActiveUser();
    noExistingIncome();
    // Bronze (5 000), Silver (15 000), Gold (50 000) all active
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500",  "5000"),
      makeAchievement("Silver", "1500", "15000"),
      makeAchievement("Gold",   "3000", "50000"),
    ]);
    mockIncomeCreate("Gold", "3000");

    const result = await generateMonthlySalary("user-1", 7, 2026);

    expect(result.status).toBe("generated");
    if (result.status === "generated") {
      expect(result.rankName).toBe("Gold");
    }

    // Only one SalaryIncome created
    expect(mockTx.salaryIncome.create).toHaveBeenCalledTimes(1);
    expect((mockTx.salaryIncome.create.mock.calls[0][0] as any).data.rankName).toBe("Gold");
  });

  // ── Test 4 ───────────────────────────────────────────────────────────────────

  it("4. skips inactive member without opening a transaction", async () => {
    pm().user.findUnique.mockResolvedValue({ id: "user-1", status: "INACTIVE" });

    const result = await generateMonthlySalary("user-1", 7, 2026);

    expect(result.status).toBe("skipped");
    if (result.status === "skipped") expect(result.reason).toBe("inactive");

    // No transaction needed for inactive users
    expect(pm().$transaction).not.toHaveBeenCalled();
  });

  // ── Test 5 ───────────────────────────────────────────────────────────────────

  it("5. skips member with no active achievements", async () => {
    setActiveUser();
    noExistingIncome();
    mockTx.salaryAchievement.findMany.mockResolvedValue([]);

    const result = await generateMonthlySalary("user-1", 7, 2026);

    expect(result.status).toBe("skipped");
    if (result.status === "skipped") expect(result.reason).toBe("no-achievement");
    expect(mockTx.salaryIncome.create).not.toHaveBeenCalled();
  });

  // ── Test 6 ───────────────────────────────────────────────────────────────────

  it("6. skips member whose highest rank has a zero monthlySalary", async () => {
    setActiveUser();
    noExistingIncome();
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "0", "5000"),
    ]);

    const result = await generateMonthlySalary("user-1", 7, 2026);

    expect(result.status).toBe("skipped");
    if (result.status === "skipped") expect(result.reason).toBe("zero-salary");
    expect(mockTx.salaryIncome.create).not.toHaveBeenCalled();
  });

  // ── Test 7 ───────────────────────────────────────────────────────────────────

  it("7. duplicate monthly run returns duplicate without modifying existing record", async () => {
    setActiveUser();
    // Existing record found for (user-1, 7, 2026)
    mockTx.salaryIncome.findUnique.mockResolvedValue({
      id:       "income-existing",
      rankName: "Bronze",
    });

    const result = await generateMonthlySalary("user-1", 7, 2026);

    expect(result.status).toBe("duplicate");
    expect(mockTx.salaryIncome.create).not.toHaveBeenCalled();
    expect(mockTx.salaryAchievement.findMany).not.toHaveBeenCalled();
  });

  // ── Test 8 ───────────────────────────────────────────────────────────────────

  it("8. transaction rollback — no partial SalaryIncome on create failure", async () => {
    setActiveUser();
    noExistingIncome();
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Silver", "1500", "15000"),
    ]);
    // Simulate a DB error inside the transaction
    mockTx.salaryIncome.create.mockRejectedValue(new Error("DB constraint violation"));

    // The $transaction mock re-throws because the callback throws
    pm().$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<GenerateResult>) => fn(mockTx),
    );

    await expect(generateMonthlySalary("user-1", 7, 2026)).rejects.toThrow(
      "DB constraint violation",
    );

    // create was attempted but failed → no committed record
    expect(mockTx.salaryIncome.create).toHaveBeenCalledTimes(1);
  });

  // ── Test 9 ───────────────────────────────────────────────────────────────────

  it("9. batch generation processes all active users", async () => {
    mockUsersOnePage(["u1", "u2", "u3"]);

    // Inline $transaction mock for each user call
    pm().$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<GenerateResult>) => fn(mockTx),
    );

    // Each user: no existing income, one achievement
    pm().user.findUnique.mockResolvedValue({ id: "any", status: "ACTIVE" });
    mockTx.salaryIncome.findUnique.mockResolvedValue(null);
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500", "5000"),
    ]);
    mockTx.salaryIncome.create.mockResolvedValue({ id: "inc", rankName: "Bronze", status: "PENDING" });

    const metrics = await generateMonthlyBatch(7, 2026, { concurrency: 2, pageSize: 100 });

    expect(metrics.usersProcessed).toBe(3);
    expect(metrics.salaryGenerated).toBe(3);
    expect(metrics.duplicatesSkipped).toBe(0);
    expect(metrics.usersSkipped).toBe(0);
    expect(metrics.usersFailed).toBe(0);
  });

  // ── Test 10 ──────────────────────────────────────────────────────────────────

  it("10. failure isolation — one user fails, others continue", async () => {
    mockUsersOnePage(["u1", "u2", "u3"]);

    // u1 succeeds, u2 throws at tx level, u3 succeeds
    pm().$transaction
      .mockImplementationOnce(async (fn: Function) => fn(mockTx))   // u1
      .mockRejectedValueOnce(new Error("u2 tx error"))               // u2
      .mockImplementationOnce(async (fn: Function) => fn(mockTx));  // u3

    pm().user.findUnique.mockResolvedValue({ id: "any", status: "ACTIVE" });
    mockTx.salaryIncome.findUnique.mockResolvedValue(null);
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500", "5000"),
    ]);
    mockTx.salaryIncome.create.mockResolvedValue({
      id: "inc", rankName: "Bronze", status: "PENDING",
    });

    const metrics = await generateMonthlyBatch(7, 2026, { concurrency: 1, pageSize: 100 });

    expect(metrics.usersProcessed).toBe(3);
    expect(metrics.salaryGenerated).toBe(2);
    expect(metrics.usersFailed).toBe(1);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u2" }),
      expect.stringContaining("user failed"),
    );
  });

  // ── Test 11 ──────────────────────────────────────────────────────────────────

  it("11. metrics accumulate correctly across mixed outcomes", async () => {
    // u1: generated, u2: duplicate, u3: skipped (inactive), u4: fails
    mockUsersOnePage(["u1", "u2", "u3", "u4"]);

    const txGenerated = async (fn: Function) => fn(mockTx);

    pm().$transaction
      .mockImplementationOnce(txGenerated)   // u1 → generated
      .mockImplementationOnce(txGenerated)   // u2 → duplicate
      .mockRejectedValueOnce(new Error("u4 error")); // u4 fails

    // u1: ACTIVE, new month → generated
    // u2: ACTIVE, existing income → duplicate
    // u3: INACTIVE → skipped before tx
    // u4: ACTIVE but tx throws
    pm().user.findUnique
      .mockResolvedValueOnce({ id: "u1", status: "ACTIVE" })
      .mockResolvedValueOnce({ id: "u2", status: "ACTIVE" })
      .mockResolvedValueOnce({ id: "u3", status: "INACTIVE" })
      .mockResolvedValueOnce({ id: "u4", status: "ACTIVE" });

    // u1 tx: no existing, one achievement
    mockTx.salaryIncome.findUnique
      .mockResolvedValueOnce(null)                                      // u1
      .mockResolvedValueOnce({ id: "existing", rankName: "Bronze" });  // u2

    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500", "5000"),
    ]);
    mockTx.salaryIncome.create.mockResolvedValue({
      id: "inc1", rankName: "Bronze", status: "PENDING",
    });

    const metrics = await generateMonthlyBatch(7, 2026, { concurrency: 1, pageSize: 100 });

    expect(metrics.usersProcessed).toBe(4);
    expect(metrics.salaryGenerated).toBe(1);    // u1
    expect(metrics.duplicatesSkipped).toBe(1);  // u2
    expect(metrics.usersSkipped).toBe(1);       // u3 (inactive)
    expect(metrics.usersFailed).toBe(1);        // u4
    expect(typeof metrics.durationMs).toBe("number");
  });

  // ── Test 12 ──────────────────────────────────────────────────────────────────

  it("12. snapshot rule — promotion after generation does not alter the existing record", async () => {
    // First run: user holds Bronze → salary generated for July
    setActiveUser();
    noExistingIncome();
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500", "5000"),
    ]);
    mockIncomeCreate("Bronze", "500");

    const firstRun = await generateMonthlySalary("user-1", 7, 2026);
    expect(firstRun.status).toBe("generated");
    if (firstRun.status === "generated") expect(firstRun.rankName).toBe("Bronze");

    // User is promoted to Gold mid-month.
    // Second run for the SAME month finds the existing record → duplicate.
    mockTx.salaryIncome.findUnique.mockResolvedValue({
      id:       "income-existing",
      rankName: "Bronze",   // original rank — unchanged
    });

    // Even though achievements now include Gold, the idempotency guard fires first.
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500",  "5000"),
      makeAchievement("Gold",   "3000", "50000"),
    ]);

    const secondRun = await generateMonthlySalary("user-1", 7, 2026);
    expect(secondRun.status).toBe("duplicate");

    // The July record was never overwritten — create only called once
    expect(mockTx.salaryIncome.create).toHaveBeenCalledTimes(1);
  });

  // ── Test 13 ──────────────────────────────────────────────────────────────────

  it("13. historical month regeneration is prevented by the idempotency guard", async () => {
    setActiveUser();

    // Simulate June 2026 already generated
    mockTx.salaryIncome.findUnique.mockResolvedValue({
      id:       "income-june",
      rankName: "Silver",
    });

    const result = await generateMonthlySalary("user-1", 6, 2026);

    expect(result.status).toBe("duplicate");
    expect(mockTx.salaryIncome.create).not.toHaveBeenCalled();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", month: 6, year: 2026 }),
      expect.stringContaining("duplicate skipped"),
    );
  });

  // ── Test 14 ──────────────────────────────────────────────────────────────────

  it("14. batch with multiple workers processes all users correctly", async () => {
    const userIds = Array.from({ length: 20 }, (_, i) => `u${i + 1}`);
    mockUsersOnePage(userIds);

    pm().$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<GenerateResult>) => fn(mockTx),
    );
    pm().user.findUnique.mockResolvedValue({ id: "any", status: "ACTIVE" });
    mockTx.salaryIncome.findUnique.mockResolvedValue(null);
    mockTx.salaryAchievement.findMany.mockResolvedValue([
      makeAchievement("Bronze", "500", "5000"),
    ]);
    mockTx.salaryIncome.create.mockResolvedValue({
      id: "inc", rankName: "Bronze", status: "PENDING",
    });

    const metrics = await generateMonthlyBatch(7, 2026, { concurrency: 5, pageSize: 100 });

    expect(metrics.usersProcessed).toBe(20);
    expect(metrics.salaryGenerated).toBe(20);
    expect(metrics.usersFailed).toBe(0);
  });
});
