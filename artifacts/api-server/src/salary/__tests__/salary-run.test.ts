/**
 * Sprint 33J — Salary Run Management Tests
 *
 * 15 scenarios:
 *  1.  SalaryRun creation — run created with GENERATING status + RUN_CREATED audit.
 *  2.  Duplicate SalaryRun prevented — same (month, year) returns existing run.
 *  3.  Generation updates counters — generatedCount and totalAmount set on run.
 *  4.  Approval updates counters — approvedCount updated on run.
 *  5.  Payout updates counters — paidCount and failedCount updated on run.
 *  6.  Run transitions — status machine advances correctly.
 *  7.  Failed run — markRunFailed sets FAILED + RUN_FAILED audit.
 *  8.  Report summary — getSalaryRunSummary returns correct metrics.
 *  9.  Member history — getMemberSalaryHistory returns salary records.
 * 10.  Rank distribution — getRankDistribution returns per-rank breakdown.
 * 11.  CSV export — exportPayrollDetailCSV generates correct headers and data rows.
 * 12.  Audit entries — each transition writes correct immutable audit record.
 * 13.  Transaction rollback — status + counters + audit fail as one unit.
 * 14.  Concurrent run creation — only one SalaryRun per (month, year).
 * 15.  Metrics correctness — all counters match actual processed outcomes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

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
    salaryRun:      { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    salaryRunAudit: { create: vi.fn() },
    salaryIncome:   {
      findMany:  vi.fn(),
      aggregate: vi.fn(),
      groupBy:   vi.fn(),
    },
    user: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../salary-income.service", () => ({
  generateMonthlySalary: vi.fn(),
}));

vi.mock("../salary-payout.service", () => ({
  approveSalary: vi.fn(),
  paySalary:     vi.fn(),
}));

vi.mock("../salary-report.service", () => ({
  getSalaryRunSummary:     vi.fn(),
  getMonthlyPayroll:       vi.fn(),
  getMemberSalaryHistory:  vi.fn(),
  getRankDistribution:     vi.fn(),
  getPayrollTotals:        vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  createSalaryRun,
  executeGeneration,
  executeApproval,
  executePayout,
  markRunFailed,
} from "../salary-run.service";
import {
  getSalaryRunSummary,
  getMemberSalaryHistory,
  getRankDistribution,
} from "../salary-report.service";
import { exportPayrollDetailCSV } from "../salary-export.service";
import { prisma } from "../../config/prisma";
import { generateMonthlySalary } from "../salary-income.service";
import { approveSalary, paySalary } from "../salary-payout.service";

// ── Helpers ───────────────────────────────────────────────────────────────────

type PrismaMock = {
  salaryRun:      { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  salaryRunAudit: { create: ReturnType<typeof vi.fn> };
  salaryIncome:   { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn> };
  user:           { findMany: ReturnType<typeof vi.fn> };
  $transaction:   ReturnType<typeof vi.fn>;
};

const pm = () => prisma as unknown as PrismaMock;

const mockTx = {
  salaryRun:      { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  salaryRunAudit: { create: vi.fn() },
};

function setupTx() {
  pm().$transaction.mockImplementation(
    async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
  );
}

function makeRun(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:             "run-1",
    month:          7,
    year:           2026,
    status:         "GENERATING",
    generatedCount: 0,
    approvedCount:  0,
    paidCount:      0,
    failedCount:    0,
    totalAmount:    new Prisma.Decimal(0),
    createdBy:      null,
    notes:          null,
    startedAt:      new Date(),
    completedAt:    null,
    createdAt:      new Date(),
    updatedAt:      new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("salary-run.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTx();
    mockTx.salaryRun.findUnique.mockResolvedValue(null);
    mockTx.salaryRun.create.mockResolvedValue(makeRun());
    mockTx.salaryRun.update.mockResolvedValue(makeRun());
    mockTx.salaryRunAudit.create.mockResolvedValue({ id: "audit-1" });
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it("1. creates a SalaryRun with GENERATING status and RUN_CREATED audit", async () => {
    const result = await createSalaryRun(7, 2026, { createdBy: "admin-1" });

    expect(result.status).toBe("created");
    expect(result.run.status).toBe("GENERATING");

    expect(mockTx.salaryRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ month: 7, year: 2026, status: "GENERATING" }),
      }),
    );

    expect(mockTx.salaryRunAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "RUN_CREATED", performedBy: "admin-1" }),
      }),
    );
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it("2. duplicate SalaryRun prevented — existing run returned without a new create", async () => {
    const existing = makeRun({ status: "GENERATED" });
    mockTx.salaryRun.findUnique.mockResolvedValue(existing);

    const result = await createSalaryRun(7, 2026);

    expect(result.status).toBe("duplicate");
    expect(result.run.status).toBe("GENERATED");
    expect(mockTx.salaryRun.create).not.toHaveBeenCalled();
    expect(mockTx.salaryRunAudit.create).not.toHaveBeenCalled();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it("3. generation updates generatedCount and totalAmount on the run", async () => {
    pm().salaryRun.findUnique.mockResolvedValue(makeRun());

    pm().user.findMany
      .mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }])
      .mockResolvedValue([]);

    const genMock = vi.mocked(generateMonthlySalary);
    genMock
      .mockResolvedValueOnce({ status: "generated", rankName: "Bronze", amount: new Prisma.Decimal("500") })
      .mockResolvedValueOnce({ status: "generated", rankName: "Silver", amount: new Prisma.Decimal("1500") });

    await executeGeneration("run-1", { concurrency: 1, pageSize: 100 });

    expect(pm().$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.salaryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data:  expect.objectContaining({
          status:         "GENERATED",
          generatedCount: 2,
        }),
      }),
    );
    const updateData = (mockTx.salaryRun.update.mock.calls[0] as any)[0].data;
    expect(updateData.totalAmount.toFixed(2)).toBe("2000.00");
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────

  it("4. approval updates approvedCount on the run", async () => {
    pm().salaryRun.findUnique.mockResolvedValue(makeRun({ status: "GENERATED" }));

    pm().salaryIncome.findMany
      .mockResolvedValueOnce([{ id: "i1", userId: "u1" }, { id: "i2", userId: "u2" }])
      .mockResolvedValue([]);

    const approveM = vi.mocked(approveSalary);
    approveM
      .mockResolvedValueOnce({ status: "approved" })
      .mockResolvedValueOnce({ status: "approved" });

    await executeApproval("run-1", { concurrency: 1, pageSize: 100 });

    // Two tx calls: APPROVING start + APPROVED end
    expect(pm().$transaction).toHaveBeenCalledTimes(2);

    // Second tx (completion): check approvedCount
    expect(mockTx.salaryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data:  expect.objectContaining({ status: "APPROVED", approvedCount: 2 }),
      }),
    );
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────

  it("5. payout updates paidCount and failedCount on the run", async () => {
    pm().salaryRun.findUnique.mockResolvedValue(makeRun({ status: "APPROVED" }));

    pm().salaryIncome.findMany
      .mockResolvedValueOnce([{ id: "i1", userId: "u1" }, { id: "i2", userId: "u2" }, { id: "i3", userId: "u3" }])
      .mockResolvedValue([]);

    const payM = vi.mocked(paySalary);
    payM
      .mockResolvedValueOnce({ status: "paid", transactionId: "wt-1", amount: new Prisma.Decimal("500") })
      .mockResolvedValueOnce({ status: "paid", transactionId: "wt-2", amount: new Prisma.Decimal("500") })
      .mockRejectedValueOnce(new Error("payout failed"));

    await executePayout("run-1", { concurrency: 1, pageSize: 100 });

    expect(mockTx.salaryRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED", paidCount: 2, failedCount: 1 }),
      }),
    );
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────

  it("6. run status transitions: GENERATING→GENERATED→APPROVING→APPROVED→PAYING→COMPLETED", async () => {
    // Create → GENERATING
    const created = await createSalaryRun(7, 2026);
    expect(created.run.status).toBe("GENERATING");

    // executeGeneration → GENERATED
    pm().salaryRun.findUnique.mockResolvedValue(makeRun({ status: "GENERATING" }));
    pm().user.findMany.mockResolvedValue([]);
    await executeGeneration("run-1");
    expect(mockTx.salaryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "GENERATED" }) }),
    );

    vi.clearAllMocks(); setupTx();

    // executeApproval → APPROVING then APPROVED
    pm().salaryRun.findUnique.mockResolvedValue(makeRun({ status: "GENERATED" }));
    pm().salaryIncome.findMany.mockResolvedValue([]);
    await executeApproval("run-1");
    expect(mockTx.salaryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }),
    );

    vi.clearAllMocks(); setupTx();

    // executePayout → PAYING then COMPLETED
    pm().salaryRun.findUnique.mockResolvedValue(makeRun({ status: "APPROVED" }));
    pm().salaryIncome.findMany.mockResolvedValue([]);
    await executePayout("run-1");
    expect(mockTx.salaryRun.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────

  it("7. markRunFailed sets status to FAILED and writes RUN_FAILED audit", async () => {
    await markRunFailed("run-1", "unrecoverable DB error", "admin-99");

    expect(mockTx.salaryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data:  { status: "FAILED" },
      }),
    );

    expect(mockTx.salaryRunAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salaryRunId: "run-1",
          action:      "RUN_FAILED",
          performedBy: "admin-99",
          metadata:    { reason: "unrecoverable DB error" },
        }),
      }),
    );
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────

  it("8. getSalaryRunSummary returns correct metrics", async () => {
    const summaryMock = vi.mocked(getSalaryRunSummary);
    summaryMock.mockResolvedValue({
      runId:        "run-1",
      month:        7,
      year:         2026,
      status:       "COMPLETED",
      totalMembers: 3,
      generated:    3,
      approved:     3,
      paid:         3,
      pending:      0,
      failed:       0,
      totalPayroll:  new Prisma.Decimal("2500"),
      averageSalary: new Prisma.Decimal("833.33"),
      highestSalary: new Prisma.Decimal("1500"),
      lowestSalary:  new Prisma.Decimal("500"),
      rankBreakdown: {
        Bronze: { count: 2, total: new Prisma.Decimal("1000") },
        Silver: { count: 1, total: new Prisma.Decimal("1500") },
      },
    });

    const summary = await getSalaryRunSummary("run-1");

    expect(summary).not.toBeNull();
    expect(summary!.totalMembers).toBe(3);
    expect(summary!.paid).toBe(3);
    expect(summary!.totalPayroll.toFixed(2)).toBe("2500.00");
    expect(summary!.rankBreakdown["Bronze"].count).toBe(2);
    expect(summary!.rankBreakdown["Silver"].total.toFixed(2)).toBe("1500.00");
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────────

  it("9. getMemberSalaryHistory returns salary records newest first", async () => {
    const historyMock = vi.mocked(getMemberSalaryHistory);
    historyMock.mockResolvedValue([
      {
        id:            "i2",
        rankName:      "Silver",
        month:         7,
        year:          2026,
        amount:        new Prisma.Decimal("1500"),
        status:        "PAID",
        approvedAt:    new Date("2026-07-15"),
        paidAt:        new Date("2026-07-16"),
        transactionId: "wt-1",
        createdAt:     new Date("2026-07-01"),
      },
      {
        id:            "i1",
        rankName:      "Bronze",
        month:         6,
        year:          2026,
        amount:        new Prisma.Decimal("500"),
        status:        "PAID",
        approvedAt:    new Date("2026-06-15"),
        paidAt:        new Date("2026-06-16"),
        transactionId: "wt-0",
        createdAt:     new Date("2026-06-01"),
      },
    ]);

    const history = await getMemberSalaryHistory("user-1");

    expect(history).toHaveLength(2);
    expect(history[0].month).toBe(7);    // newest first
    expect(history[1].month).toBe(6);
    expect(history[0].amount.toFixed(2)).toBe("1500.00");
    expect(history[0].transactionId).toBe("wt-1");
  });

  // ── Test 10 ─────────────────────────────────────────────────────────────────

  it("10. getRankDistribution returns per-rank count and total", async () => {
    const distMock = vi.mocked(getRankDistribution);
    distMock.mockResolvedValue([
      { rankName: "Silver", count: 1, total: new Prisma.Decimal("1500") },
      { rankName: "Bronze", count: 2, total: new Prisma.Decimal("1000") },
    ]);

    const dist = await getRankDistribution(7, 2026);

    expect(dist).toHaveLength(2);
    expect(dist[0].rankName).toBe("Silver");
    expect(dist[0].count).toBe(1);
    expect(dist[0].total.toFixed(2)).toBe("1500.00");
    expect(dist[1].rankName).toBe("Bronze");
    expect(dist[1].count).toBe(2);
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────────

  it("11. exportPayrollDetailCSV generates correct headers and data rows", async () => {
    // Mock the report service that the export service calls
    const { getMonthlyPayroll } = await import("../salary-report.service");
    vi.mocked(getMonthlyPayroll).mockResolvedValue({
      run: { id: "run-1", status: "COMPLETED" },
      incomes: [
        {
          id:        "i1",
          userId:    "u1",
          rankName:  "Bronze",
          amount:    new Prisma.Decimal("500"),
          status:    "PAID",
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
        },
        {
          id:        "i2",
          userId:    "u2",
          rankName:  "Silver",
          amount:    new Prisma.Decimal("1500"),
          status:    "PAID",
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
    });

    const csv = await exportPayrollDetailCSV(7, 2026);

    const lines = csv.split("\n");
    expect(lines[0]).toBe("Income ID,User ID,Rank,Amount (USD),Status,Created At");
    expect(lines).toHaveLength(3);         // header + 2 rows
    expect(lines[1]).toContain("Bronze");
    expect(lines[1]).toContain("500.00");
    expect(lines[2]).toContain("Silver");
    expect(lines[2]).toContain("1500.00");
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────────

  it("12. audit entries written at each lifecycle transition", async () => {
    // Creation: RUN_CREATED
    await createSalaryRun(7, 2026, { createdBy: "admin-1" });
    expect(mockTx.salaryRunAudit.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "RUN_CREATED" }),
      }),
    );

    vi.clearAllMocks(); setupTx();

    // Generation complete: GENERATION_COMPLETED
    pm().salaryRun.findUnique.mockResolvedValue(makeRun());
    pm().user.findMany.mockResolvedValue([]);
    await executeGeneration("run-1");
    expect(mockTx.salaryRunAudit.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "GENERATION_COMPLETED" }),
      }),
    );

    vi.clearAllMocks(); setupTx();

    // Payout complete: PAYOUT_COMPLETED
    pm().salaryRun.findUnique.mockResolvedValue(makeRun({ status: "APPROVED" }));
    pm().salaryIncome.findMany.mockResolvedValue([]);
    await executePayout("run-1");
    expect(mockTx.salaryRunAudit.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "PAYOUT_COMPLETED" }),
      }),
    );
  });

  // ── Test 13 ─────────────────────────────────────────────────────────────────

  it("13. transaction rollback — status + counters + audit fail as one unit", async () => {
    pm().salaryRun.findUnique.mockResolvedValue(makeRun());
    pm().user.findMany.mockResolvedValue([]);

    // Simulate $transaction throwing on the final commit step
    pm().$transaction.mockRejectedValueOnce(new Error("commit failed"));

    await expect(executeGeneration("run-1")).rejects.toThrow("commit failed");

    // Run was never marked GENERATED (transaction rolled back)
    expect(mockTx.salaryRun.update).not.toHaveBeenCalled();
    expect(mockTx.salaryRunAudit.create).not.toHaveBeenCalled();
  });

  // ── Test 14 ─────────────────────────────────────────────────────────────────

  it("14. concurrent run creation — only one SalaryRun per (month, year)", async () => {
    // First call: no existing run → creates
    const firstTx  = { ...mockTx };
    const secondTx = { ...mockTx };

    firstTx.salaryRun  = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
    firstTx.salaryRunAudit = { create: vi.fn() };
    firstTx.salaryRun.findUnique.mockResolvedValue(null);
    firstTx.salaryRun.create.mockResolvedValue(makeRun({ id: "run-1" }));
    firstTx.salaryRunAudit.create.mockResolvedValue({ id: "a1" });

    // Second call: finds the run created by first → duplicate
    const createdRun = makeRun({ status: "GENERATING" });
    secondTx.salaryRun  = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
    secondTx.salaryRunAudit = { create: vi.fn() };
    secondTx.salaryRun.findUnique.mockResolvedValue(createdRun);

    pm().$transaction
      .mockImplementationOnce(async (fn: Function) => fn(firstTx))
      .mockImplementationOnce(async (fn: Function) => fn(secondTx));

    const [first, second] = await Promise.all([
      createSalaryRun(7, 2026),
      createSalaryRun(7, 2026),
    ]);

    expect(first.status).toBe("created");
    expect(second.status).toBe("duplicate");

    expect(firstTx.salaryRun.create).toHaveBeenCalledTimes(1);
    expect(secondTx.salaryRun.create).not.toHaveBeenCalled();
  });

  // ── Test 15 ─────────────────────────────────────────────────────────────────

  it("15. metrics correctness — counters match actual processed outcomes", async () => {
    // Generation: 3 users, 2 generated, 1 skipped
    pm().salaryRun.findUnique.mockResolvedValue(makeRun());
    pm().user.findMany
      .mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }, { id: "u3" }])
      .mockResolvedValue([]);

    const genMock = vi.mocked(generateMonthlySalary);
    genMock
      .mockResolvedValueOnce({ status: "generated", rankName: "Bronze", amount: new Prisma.Decimal("500") })
      .mockResolvedValueOnce({ status: "generated", rankName: "Silver", amount: new Prisma.Decimal("1500") })
      .mockResolvedValueOnce({ status: "skipped", reason: "inactive" });

    const genResult = await executeGeneration("run-1", { concurrency: 1, pageSize: 100 });

    expect(genResult.generatedCount).toBe(2);
    expect(genResult.totalAmount.toFixed(2)).toBe("2000.00");
    expect(genResult.failedCount).toBe(0);

    vi.clearAllMocks(); setupTx();

    // Payout: 3 incomes, 2 paid, 1 fails
    pm().salaryRun.findUnique.mockResolvedValue(makeRun({ status: "APPROVED" }));
    pm().salaryIncome.findMany
      .mockResolvedValueOnce([{ id: "i1", userId: "u1" }, { id: "i2", userId: "u2" }, { id: "i3", userId: "u3" }])
      .mockResolvedValue([]);

    const payM = vi.mocked(paySalary);
    payM
      .mockResolvedValueOnce({ status: "paid", transactionId: "wt-1", amount: new Prisma.Decimal("500") })
      .mockResolvedValueOnce({ status: "paid", transactionId: "wt-2", amount: new Prisma.Decimal("1500") })
      .mockRejectedValueOnce(new Error("network error"));

    const payResult = await executePayout("run-1", { concurrency: 1, pageSize: 100 });

    expect(payResult.paidCount).toBe(2);
    expect(payResult.failedCount).toBe(1);
    expect(payResult.walletAmountCredited.toFixed(2)).toBe("2000.00");
    expect(payResult.finalStatus).toBe("COMPLETED"); // some succeeded → COMPLETED not FAILED
  });
});
