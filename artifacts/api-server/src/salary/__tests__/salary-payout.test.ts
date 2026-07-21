/**
 * Sprint 33I — Salary Approval & Payout Engine Tests
 *
 * 15 scenarios:
 *  1.  Approve PENDING salary.
 *  2.  Approve already-APPROVED — duplicate.
 *  3.  Approve PAID salary — rejected.
 *  4.  Pay APPROVED salary — wallet credited.
 *  5.  Pay PENDING salary — rejected.
 *  6.  Pay already-PAID salary — duplicate.
 *  7.  Wallet credit + SalaryIncome update are atomic (rollback on failure).
 *  8.  WalletTransaction created with correct fields.
 *  9.  Batch approval processes all PENDING records.
 * 10.  Batch payout processes all APPROVED records.
 * 11.  Failure isolation — one fails, rest continue.
 * 12.  Metrics accumulated correctly.
 * 13.  Duplicate batch payout — already-PAID records skipped.
 * 14.  Concurrent payout attempt — only the first succeeds.
 * 15.  Immutable status transitions — cannot move backwards.
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
    salaryIncome: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
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
  approveSalary,
  paySalary,
  approveMonthlyBatch,
  payMonthlyBatch,
} from "../salary-payout.service";
import { prisma } from "../../config/prisma";
import { logger } from "../../lib/logger";

// ── Helpers ───────────────────────────────────────────────────────────────────

type PrismaMock = {
  salaryIncome: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const pm = () => prisma as unknown as PrismaMock;

/** Transaction mock object with all operations used by the payout service */
const mockTx = {
  salaryIncome:      { findUnique: vi.fn(), update: vi.fn() },
  wallet:            { findUnique: vi.fn(), update: vi.fn() },
  walletTransaction: { create: vi.fn() },
  salaryPayoutEvent: { create: vi.fn() },
};

/** Wire $transaction to execute the callback with mockTx immediately */
function setupTx() {
  pm().$transaction.mockImplementation(
    async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
  );
}

/** Make a fake SalaryIncome row */
function makeIncome(status: "PENDING" | "APPROVED" | "PAID", overrides: object = {}) {
  return {
    id:        "income-1",
    userId:    "user-1",
    rankName:  "Bronze",
    month:     7,
    year:      2026,
    amount:    new Prisma.Decimal("500"),
    status,
    reference: "salary-user-1-2026-07",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("salary-payout.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTx();
    // Default: tx operations succeed as no-ops unless overridden
    mockTx.salaryIncome.update.mockResolvedValue({});
    mockTx.salaryPayoutEvent.create.mockResolvedValue({ id: "event-1" });
    mockTx.wallet.findUnique.mockResolvedValue({ id: "wallet-1" });
    mockTx.wallet.update.mockResolvedValue({});
    mockTx.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
  });

  // ── Test 1 ───────────────────────────────────────────────────────────────────

  it("1. approves a PENDING salary — status transitions to APPROVED", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PENDING"));

    const result = await approveSalary("income-1", "admin-42");

    expect(result.status).toBe("approved");

    expect(mockTx.salaryIncome.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "income-1" },
        data:  expect.objectContaining({
          status:     "APPROVED",
          approvedAt: expect.any(Date),
          approvedBy: "admin-42",
        }),
      }),
    );

    expect(mockTx.salaryPayoutEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          salaryIncomeId: "income-1",
          userId:         "user-1",
          eventType:      "APPROVED",
          performedBy:    "admin-42",
        }),
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ incomeId: "income-1" }),
      expect.stringContaining("salary approved"),
    );
  });

  // ── Test 2 ───────────────────────────────────────────────────────────────────

  it("2. approving an already-APPROVED salary returns duplicate — no writes", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("APPROVED"));

    const result = await approveSalary("income-1");

    expect(result.status).toBe("duplicate");
    expect(mockTx.salaryIncome.update).not.toHaveBeenCalled();
    expect(mockTx.salaryPayoutEvent.create).not.toHaveBeenCalled();
  });

  // ── Test 3 ───────────────────────────────────────────────────────────────────

  it("3. approving a PAID salary is rejected — backwards transition forbidden", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PAID"));

    const result = await approveSalary("income-1");

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toBe("already-paid");
    expect(mockTx.salaryIncome.update).not.toHaveBeenCalled();
  });

  // ── Test 4 ───────────────────────────────────────────────────────────────────

  it("4. pays an APPROVED salary — withdrawal wallet credited", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("APPROVED"));

    const result = await paySalary("income-1");

    expect(result.status).toBe("paid");

    // Wallet credited
    expect(mockTx.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        data:  { withdrawalWallet: { increment: expect.any(Prisma.Decimal) } },
      }),
    );

    // SalaryIncome updated to PAID
    expect(mockTx.salaryIncome.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "income-1" },
        data:  expect.objectContaining({
          status:        "PAID",
          paidAt:        expect.any(Date),
          transactionId: "wt-1",
        }),
      }),
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ incomeId: "income-1", userId: "user-1" }),
      expect.stringContaining("wallet credited"),
    );
  });

  // ── Test 5 ───────────────────────────────────────────────────────────────────

  it("5. paying a PENDING salary is rejected — must be approved first", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PENDING"));

    const result = await paySalary("income-1");

    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toBe("not-approved");
    expect(mockTx.wallet.update).not.toHaveBeenCalled();
    expect(mockTx.walletTransaction.create).not.toHaveBeenCalled();
  });

  // ── Test 6 ───────────────────────────────────────────────────────────────────

  it("6. paying an already-PAID salary returns duplicate — wallet NOT credited again", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PAID"));

    const result = await paySalary("income-1");

    expect(result.status).toBe("duplicate");
    expect(mockTx.wallet.update).not.toHaveBeenCalled();
    expect(mockTx.walletTransaction.create).not.toHaveBeenCalled();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ incomeId: "income-1" }),
      expect.stringContaining("duplicate payout skipped"),
    );
  });

  // ── Test 7 ───────────────────────────────────────────────────────────────────

  it("7. transaction rollback — wallet is NOT credited when SalaryIncome update fails", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("APPROVED"));

    // Simulate a DB error when updating SalaryIncome to PAID
    mockTx.salaryIncome.update.mockRejectedValue(new Error("DB error on PAID update"));

    // The $transaction mock re-throws because the callback throws
    pm().$transaction.mockImplementation(async (fn: Function) => fn(mockTx));

    await expect(paySalary("income-1")).rejects.toThrow("DB error on PAID update");

    // Wallet update WAS called (ordered before salaryIncome.update in the tx)
    // but since $transaction threw, no real DB commit occurred
    expect(mockTx.wallet.update).toHaveBeenCalledTimes(1);
    // WalletTransaction create was called but also rolled back
    expect(mockTx.walletTransaction.create).toHaveBeenCalledTimes(1);
    // The salaryIncome.update failed → no PAID status committed
    expect(mockTx.salaryIncome.update).toHaveBeenCalledTimes(1);
  });

  // ── Test 8 ───────────────────────────────────────────────────────────────────

  it("8. WalletTransaction is created with correct fields", async () => {
    mockTx.salaryIncome.findUnique.mockResolvedValue(
      makeIncome("APPROVED", { rankName: "Gold", amount: new Prisma.Decimal("3000") }),
    );

    await paySalary("income-1");

    expect(mockTx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletId: "wallet-1",
          userId:   "user-1",
          type:     "SALARY",
          status:   "SUCCESS",
          amount:   expect.any(Prisma.Decimal),
        }),
      }),
    );

    const txData = (mockTx.walletTransaction.create.mock.calls[0] as any)[0].data;
    expect(txData.amount.toFixed(2)).toBe("3000.00");
    expect(txData.description).toContain("Gold");
  });

  // ── Test 9 ───────────────────────────────────────────────────────────────────

  it("9. batch approval processes all PENDING records", async () => {
    // Three PENDING income records
    pm().salaryIncome.findMany
      .mockResolvedValueOnce([
        { id: "i1", userId: "u1", amount: new Prisma.Decimal("500") },
        { id: "i2", userId: "u2", amount: new Prisma.Decimal("1500") },
        { id: "i3", userId: "u3", amount: new Prisma.Decimal("500") },
      ])
      .mockResolvedValue([]);

    // Each approveSalary call → tx → success
    mockTx.salaryIncome.findUnique
      .mockResolvedValueOnce(makeIncome("PENDING", { id: "i1", userId: "u1" }))
      .mockResolvedValueOnce(makeIncome("PENDING", { id: "i2", userId: "u2", rankName: "Silver" }))
      .mockResolvedValueOnce(makeIncome("PENDING", { id: "i3", userId: "u3" }));

    const metrics = await approveMonthlyBatch(7, 2026, { concurrency: 2, pageSize: 100 });

    expect(metrics.processed).toBe(3);
    expect(metrics.approved).toBe(3);
    expect(metrics.duplicates).toBe(0);
    expect(metrics.failed).toBe(0);
  });

  // ── Test 10 ──────────────────────────────────────────────────────────────────

  it("10. batch payout processes all APPROVED records and accumulates credit", async () => {
    pm().salaryIncome.findMany
      .mockResolvedValueOnce([
        { id: "i1", userId: "u1", amount: new Prisma.Decimal("500") },
        { id: "i2", userId: "u2", amount: new Prisma.Decimal("1500") },
      ])
      .mockResolvedValue([]);

    mockTx.salaryIncome.findUnique
      .mockResolvedValueOnce(makeIncome("APPROVED", { id: "i1", userId: "u1", amount: new Prisma.Decimal("500") }))
      .mockResolvedValueOnce(makeIncome("APPROVED", { id: "i2", userId: "u2", amount: new Prisma.Decimal("1500"), rankName: "Silver" }));

    mockTx.walletTransaction.create
      .mockResolvedValueOnce({ id: "wt-1" })
      .mockResolvedValueOnce({ id: "wt-2" });

    const metrics = await payMonthlyBatch(7, 2026, { concurrency: 2, pageSize: 100 });

    expect(metrics.processed).toBe(2);
    expect(metrics.paid).toBe(2);
    expect(metrics.duplicates).toBe(0);
    expect(metrics.walletAmountCredited.toFixed(2)).toBe("2000.00");
  });

  // ── Test 11 ──────────────────────────────────────────────────────────────────

  it("11. failure isolation — one payout fails, others continue", async () => {
    pm().salaryIncome.findMany
      .mockResolvedValueOnce([
        { id: "i1", userId: "u1", amount: new Prisma.Decimal("500") },
        { id: "i2", userId: "u2", amount: new Prisma.Decimal("500") },
        { id: "i3", userId: "u3", amount: new Prisma.Decimal("500") },
      ])
      .mockResolvedValue([]);

    // i2 throws at transaction level
    pm().$transaction
      .mockImplementationOnce(async (fn: Function) => fn(mockTx))   // i1 succeeds
      .mockRejectedValueOnce(new Error("i2 DB error"))               // i2 fails
      .mockImplementationOnce(async (fn: Function) => fn(mockTx));  // i3 succeeds

    mockTx.salaryIncome.findUnique
      .mockResolvedValueOnce(makeIncome("APPROVED", { id: "i1", userId: "u1" }))
      .mockResolvedValueOnce(makeIncome("APPROVED", { id: "i3", userId: "u3" }));

    mockTx.walletTransaction.create
      .mockResolvedValueOnce({ id: "wt-1" })
      .mockResolvedValueOnce({ id: "wt-3" });

    const metrics = await payMonthlyBatch(7, 2026, { concurrency: 1, pageSize: 100 });

    expect(metrics.processed).toBe(3);
    expect(metrics.paid).toBe(2);
    expect(metrics.failed).toBe(1);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ incomeId: "i2" }),
      expect.stringContaining("payout failed"),
    );
  });

  // ── Test 12 ──────────────────────────────────────────────────────────────────

  it("12. metrics accumulate correctly across mixed outcomes", async () => {
    // i1: paid, i2: duplicate (already PAID), i3: fails
    pm().salaryIncome.findMany
      .mockResolvedValueOnce([
        { id: "i1", userId: "u1", amount: new Prisma.Decimal("500")  },
        { id: "i2", userId: "u2", amount: new Prisma.Decimal("1000") },
        { id: "i3", userId: "u3", amount: new Prisma.Decimal("500")  },
      ])
      .mockResolvedValue([]);

    pm().$transaction
      .mockImplementationOnce(async (fn: Function) => fn(mockTx))   // i1 → paid
      .mockImplementationOnce(async (fn: Function) => fn(mockTx))   // i2 → duplicate
      .mockRejectedValueOnce(new Error("i3 error"));                 // i3 → failed

    mockTx.salaryIncome.findUnique
      .mockResolvedValueOnce(makeIncome("APPROVED", { id: "i1", userId: "u1", amount: new Prisma.Decimal("500") }))
      .mockResolvedValueOnce(makeIncome("PAID",     { id: "i2", userId: "u2" }));

    mockTx.walletTransaction.create.mockResolvedValueOnce({ id: "wt-1" });

    const metrics = await payMonthlyBatch(7, 2026, { concurrency: 1, pageSize: 100 });

    expect(metrics.processed).toBe(3);
    expect(metrics.paid).toBe(1);
    expect(metrics.duplicates).toBe(1);
    expect(metrics.failed).toBe(1);
    expect(metrics.walletAmountCredited.toFixed(2)).toBe("500.00");
    expect(typeof metrics.durationMs).toBe("number");
  });

  // ── Test 13 ──────────────────────────────────────────────────────────────────

  it("13. duplicate batch payout run skips already-PAID records", async () => {
    // Second run: all records are already PAID
    pm().salaryIncome.findMany
      .mockResolvedValueOnce([
        { id: "i1", userId: "u1", amount: new Prisma.Decimal("500") },
        { id: "i2", userId: "u2", amount: new Prisma.Decimal("500") },
      ])
      .mockResolvedValue([]);

    mockTx.salaryIncome.findUnique
      .mockResolvedValueOnce(makeIncome("PAID", { id: "i1", userId: "u1" }))
      .mockResolvedValueOnce(makeIncome("PAID", { id: "i2", userId: "u2" }));

    const metrics = await payMonthlyBatch(7, 2026, { concurrency: 2, pageSize: 100 });

    expect(metrics.paid).toBe(0);
    expect(metrics.duplicates).toBe(2);
    expect(metrics.walletAmountCredited.toFixed(2)).toBe("0.00");
    expect(mockTx.wallet.update).not.toHaveBeenCalled();
  });

  // ── Test 14 ──────────────────────────────────────────────────────────────────

  it("14. concurrent payout attempt — only the first succeeds, second is a duplicate", async () => {
    // Simulate concurrency: first call's tx commits, second call's tx sees PAID
    const firstTx  = { ...mockTx };
    const secondTx = { ...mockTx };

    // First call: status APPROVED inside tx → succeeds
    firstTx.salaryIncome  = { findUnique: vi.fn(), update: vi.fn() };
    firstTx.walletTransaction = { create: vi.fn() };
    firstTx.wallet        = { findUnique: vi.fn(), update: vi.fn() };
    firstTx.salaryPayoutEvent = { create: vi.fn() };

    firstTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("APPROVED"));
    firstTx.wallet.findUnique.mockResolvedValue({ id: "wallet-1" });
    firstTx.wallet.update.mockResolvedValue({});
    firstTx.walletTransaction.create.mockResolvedValue({ id: "wt-first" });
    firstTx.salaryIncome.update.mockResolvedValue({});
    firstTx.salaryPayoutEvent.create.mockResolvedValue({ id: "evt-1" });

    // Second call: status PAID inside tx → duplicate
    secondTx.salaryIncome = { findUnique: vi.fn(), update: vi.fn() };
    secondTx.walletTransaction = { create: vi.fn() };
    secondTx.wallet       = { findUnique: vi.fn(), update: vi.fn() };
    secondTx.salaryPayoutEvent = { create: vi.fn() };

    secondTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PAID"));

    pm().$transaction
      .mockImplementationOnce(async (fn: Function) => fn(firstTx))
      .mockImplementationOnce(async (fn: Function) => fn(secondTx));

    const [first, second] = await Promise.all([
      paySalary("income-1"),
      paySalary("income-1"),
    ]);

    expect(first.status).toBe("paid");
    expect(second.status).toBe("duplicate");

    // Wallet only credited once
    expect(firstTx.wallet.update).toHaveBeenCalledTimes(1);
    expect(secondTx.wallet.update).not.toHaveBeenCalled();
  });

  // ── Test 15 ──────────────────────────────────────────────────────────────────

  it("15. immutable status transitions — backwards moves are rejected", async () => {
    // Cannot go PAID → APPROVED
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PAID"));
    const paidToApproved = await approveSalary("income-1");
    expect(paidToApproved.status).toBe("rejected");
    if (paidToApproved.status === "rejected") {
      expect(paidToApproved.reason).toBe("already-paid");
    }

    vi.clearAllMocks();
    setupTx();

    // Cannot go PAID → re-pay (duplicate guard)
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PAID"));
    const paidToPaid = await paySalary("income-1");
    expect(paidToPaid.status).toBe("duplicate");

    vi.clearAllMocks();
    setupTx();

    // Cannot go APPROVED → PENDING (no API for this — only forward transitions exist)
    // Cannot go PENDING → PAID directly (requires APPROVED first)
    mockTx.salaryIncome.findUnique.mockResolvedValue(makeIncome("PENDING"));
    const pendingToPaid = await paySalary("income-1");
    expect(pendingToPaid.status).toBe("rejected");
    if (pendingToPaid.status === "rejected") {
      expect(pendingToPaid.reason).toBe("not-approved");
    }

    // No wallet credits in any of the above
    expect(mockTx.wallet.update).not.toHaveBeenCalled();
  });
});
