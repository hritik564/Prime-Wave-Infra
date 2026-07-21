/**
 * Sprint 33E — Salary Business Service Tests
 *
 * 12 scenarios covering:
 *  1.  Investment created  → direct sponsor (depth 1) credited
 *  2.  Investment created  → depth-2 ancestor credited as DOWNLINE
 *  3.  Investment cancelled → DIRECT counter decremented
 *  4.  Investment refunded  → DIRECT counter decremented
 *  5.  Power BV added      → POWER counter incremented
 *  6.  Power BV removed    → POWER counter decremented
 *  7.  Duplicate investment event  → no double-credit
 *  8.  Duplicate power BV event    → no double-credit
 *  9.  Sponsor chain depth > 50    → propagation stops, warning logged
 * 10.  Negative balance prevented  → delta clamped, warning logged
 * 11.  Transaction failure          → error caught, other ancestors still processed
 * 12.  Re-running same investment   → idempotent, single event created
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

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
    user:        { findUnique: vi.fn() },
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

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import {
  propagateInvestmentBusiness,
  updatePowerBusiness,
  creditDirectBusiness,
  debitDirectBusiness,
  creditPowerBusiness,
  debitPowerBusiness,
} from "../salary-business.service";
import { prisma } from "../../config/prisma";
import { logger } from "../../lib/logger";

// ── Test helpers ──────────────────────────────────────────────────────────────

type PrismaMock = {
  user:         { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

/** Minimal transaction client mock */
function makeMockTx(overrides: {
  existingEvent?: { id: string } | null;
  currentSummary?: { directBusiness: string; downlineBusiness: string; powerBusiness: string } | null;
  createShouldThrow?: boolean;
} = {}) {
  const { existingEvent = null, currentSummary = null, createShouldThrow = false } = overrides;

  return {
    salaryBusinessEvent: {
      findUnique: vi.fn().mockResolvedValue(existingEvent),
      create: createShouldThrow
        ? vi.fn().mockRejectedValue(new Error("DB write failed"))
        : vi.fn().mockResolvedValue({ id: "evt-new" }),
    },
    salaryBusinessSummary: {
      findUnique: vi.fn().mockResolvedValue(
        currentSummary
          ? {
              directBusiness:   new Prisma.Decimal(currentSummary.directBusiness),
              downlineBusiness: new Prisma.Decimal(currentSummary.downlineBusiness),
              powerBusiness:    new Prisma.Decimal(currentSummary.powerBusiness),
            }
          : null,
      ),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

/** Wire up $transaction to run the callback with the provided mock tx. */
function setupTx(mockTx: ReturnType<typeof makeMockTx>) {
  (prisma as unknown as PrismaMock).$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(mockTx),
  );
}

/**
 * Mock a linear sponsor chain: investor → chainIds[0] (depth 1) → chainIds[1] (depth 2) → ...
 * The last entry in chainIds has no sponsor.
 */
function mockChain(investorId: string, sponsorIds: string[]) {
  const chain = [investorId, ...sponsorIds];
  (prisma as unknown as PrismaMock).user.findUnique.mockImplementation(
    ({ where }: { where: { id: string } }) => {
      const idx = chain.indexOf(where.id);
      if (idx === -1 || idx === chain.length - 1) {
        return Promise.resolve({ sponsorId: null });
      }
      return Promise.resolve({ sponsorId: chain[idx + 1] });
    },
  );
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("salary-business.service", () => {
  const INVESTOR_ID   = "investor-1";
  const SPONSOR_A_ID  = "sponsor-a";
  const SPONSOR_B_ID  = "sponsor-b";
  const INVESTMENT_ID = "inv-abc";
  const AMOUNT        = new Prisma.Decimal("500.00000000");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: direct sponsor credited on INVESTMENT_CREATED ──────────────────

  it("1. credits direct sponsor (depth 1) when investment is created", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID]);
    const mockTx = makeMockTx();
    setupTx(mockTx);

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CREATED");

    expect((prisma as unknown as PrismaMock).$transaction).toHaveBeenCalledTimes(1);

    const eventCreate = mockTx.salaryBusinessEvent.create;
    expect(eventCreate).toHaveBeenCalledTimes(1);
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId:      SPONSOR_A_ID,
          sourceUserId: INVESTOR_ID,
          pool:        "DIRECT",
          eventType:   "INVESTMENT_CREATED",
          depth:       1,
        }),
      }),
    );

    expect(mockTx.salaryBusinessSummary.upsert).toHaveBeenCalledTimes(1);
    expect(mockTx.salaryBusinessSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { userId: SPONSOR_A_ID },
        update: expect.objectContaining({ directBusiness: expect.anything() }),
      }),
    );
  });

  // ── Test 2: depth-2 ancestor credited as DOWNLINE ──────────────────────────

  it("2. credits depth-2 ancestor as DOWNLINE when investment is created", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID, SPONSOR_B_ID]);
    const mockTx = makeMockTx();
    setupTx(mockTx);

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CREATED");

    expect((prisma as unknown as PrismaMock).$transaction).toHaveBeenCalledTimes(2);

    const calls = mockTx.salaryBusinessEvent.create.mock.calls;
    expect(calls).toHaveLength(2);

    // First call: DIRECT for sponsorA
    expect(calls[0][0].data).toMatchObject({
      userId:   SPONSOR_A_ID,
      pool:     "DIRECT",
      depth:    1,
    });

    // Second call: DOWNLINE for sponsorB
    expect(calls[1][0].data).toMatchObject({
      userId:   SPONSOR_B_ID,
      pool:     "DOWNLINE",
      depth:    2,
    });
  });

  // ── Test 3: investment cancelled → DIRECT decremented ──────────────────────

  it("3. debits direct sponsor when investment is cancelled", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID]);
    const mockTx = makeMockTx({
      currentSummary: { directBusiness: "500.00000000", downlineBusiness: "0.00000000", powerBusiness: "0.00000000" },
    });
    setupTx(mockTx);

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CANCELLED");

    const eventCreate = mockTx.salaryBusinessEvent.create;
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pool:      "DIRECT",
          eventType: "INVESTMENT_CANCELLED",
          delta:     new Prisma.Decimal("-500.00000000"),
        }),
      }),
    );

    expect(mockTx.salaryBusinessSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          directBusiness: { decrement: new Prisma.Decimal("500.00000000") },
        }),
      }),
    );
  });

  // ── Test 4: investment refunded → DIRECT decremented ──────────────────────

  it("4. debits direct sponsor when investment is refunded", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID]);
    const mockTx = makeMockTx({
      currentSummary: { directBusiness: "500.00000000", downlineBusiness: "0.00000000", powerBusiness: "0.00000000" },
    });
    setupTx(mockTx);

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_REFUNDED");

    const eventCreate = mockTx.salaryBusinessEvent.create;
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pool:      "DIRECT",
          eventType: "INVESTMENT_REFUNDED",
        }),
      }),
    );
  });

  // ── Test 5: Power BV added → POWER counter incremented ──────────────────

  it("5. credits power business when power BV is added", async () => {
    const mockTx = makeMockTx();
    setupTx(mockTx);

    const bv      = new Prisma.Decimal("1000.00000000");
    const ledgerId = "ledger-xyz";

    await updatePowerBusiness("user-1", ledgerId, bv, "POWER_BV_ADDED");

    expect((prisma as unknown as PrismaMock).$transaction).toHaveBeenCalledTimes(1);

    expect(mockTx.salaryBusinessEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId:        "user-1",
          sourceUserId:  "user-1",
          pool:          "POWER",
          eventType:     "POWER_BV_ADDED",
          referenceType: "power_bv_ledger",
          referenceId:   ledgerId,
          depth:         null,
        }),
      }),
    );

    expect(mockTx.salaryBusinessSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          powerBusiness: { increment: bv },
        }),
      }),
    );
  });

  // ── Test 6: Power BV removed → POWER counter decremented ────────────────

  it("6. debits power business when power BV is removed", async () => {
    const bv = new Prisma.Decimal("500.00000000");
    const mockTx = makeMockTx({
      currentSummary: { directBusiness: "0.00000000", downlineBusiness: "0.00000000", powerBusiness: "1000.00000000" },
    });
    setupTx(mockTx);

    await updatePowerBusiness("user-1", "ledger-xyz", bv, "POWER_BV_REMOVED");

    expect(mockTx.salaryBusinessEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pool:      "POWER",
          eventType: "POWER_BV_REMOVED",
          delta:     new Prisma.Decimal("-500.00000000"),
        }),
      }),
    );

    expect(mockTx.salaryBusinessSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          powerBusiness: { decrement: bv },
        }),
      }),
    );
  });

  // ── Test 7: duplicate investment event → no double-credit ───────────────

  it("7. skips duplicate investment event — no double-credit", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID]);
    const mockTx = makeMockTx({ existingEvent: { id: "evt-existing" } });
    setupTx(mockTx);

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CREATED");

    expect(mockTx.salaryBusinessEvent.findUnique).toHaveBeenCalledTimes(1);
    expect(mockTx.salaryBusinessEvent.create).not.toHaveBeenCalled();
    expect(mockTx.salaryBusinessSummary.upsert).not.toHaveBeenCalled();

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SPONSOR_A_ID }),
      expect.stringContaining("duplicate"),
    );
  });

  // ── Test 8: duplicate power BV event → no double-credit ─────────────────

  it("8. skips duplicate power BV event — no double-credit", async () => {
    const mockTx = makeMockTx({ existingEvent: { id: "evt-existing-power" } });
    setupTx(mockTx);

    await updatePowerBusiness("user-1", "ledger-xyz", new Prisma.Decimal("1000"), "POWER_BV_ADDED");

    expect(mockTx.salaryBusinessEvent.create).not.toHaveBeenCalled();
    expect(mockTx.salaryBusinessSummary.upsert).not.toHaveBeenCalled();
  });

  // ── Test 9: sponsor chain depth > 50 → stops safely ─────────────────────

  it("9. stops sponsor chain propagation at depth 50 and logs a warning", async () => {
    // Always returns a new unique sponsorId → chain longer than 50
    let counter = 0;
    (prisma as unknown as PrismaMock).user.findUnique.mockImplementation(() =>
      Promise.resolve({ sponsorId: `deep-user-${++counter}` }),
    );

    const mockTx = makeMockTx();
    setupTx(mockTx);

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CREATED");

    // Chain is capped at 50 entries → $transaction called exactly 50 times
    expect((prisma as unknown as PrismaMock).$transaction).toHaveBeenCalledTimes(50);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 50 }),
      expect.stringContaining("depth limit"),
    );
  });

  // ── Test 10: negative balance prevented ─────────────────────────────────

  it("10. clamps debit delta to available balance — never goes negative", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID]);
    const mockTx = makeMockTx({
      // Current DIRECT balance = 3; requested debit = 5 → clamp to -3
      currentSummary: { directBusiness: "3.00000000", downlineBusiness: "0.00000000", powerBusiness: "0.00000000" },
    });
    setupTx(mockTx);

    const bigAmount = new Prisma.Decimal("5.00000000");
    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, bigAmount, "INVESTMENT_CANCELLED");

    // Event should be written with the clamped delta, not the full -5
    expect(mockTx.salaryBusinessEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: new Prisma.Decimal("-3.00000000"),   // clamped: only what exists
        }),
      }),
    );

    expect(mockTx.salaryBusinessSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          directBusiness: { decrement: new Prisma.Decimal("3.00000000") },
        }),
      }),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SPONSOR_A_ID }),
      expect.stringContaining("clamped"),
    );
  });

  // ── Test 11: transaction failure → error caught, processing continues ────

  it("11. catches per-ancestor tx failure and continues to next ancestor", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID, SPONSOR_B_ID]);

    let callCount = 0;
    (prisma as unknown as PrismaMock).$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => {
        callCount++;
        if (callCount === 1) {
          // First ancestor (SPONSOR_A) fails
          throw new Error("simulated tx failure");
        }
        // Second ancestor (SPONSOR_B) succeeds
        const mockTx = makeMockTx();
        return cb(mockTx);
      },
    );

    // Should not throw even though first ancestor failed
    await expect(
      propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CREATED"),
    ).resolves.not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SPONSOR_A_ID }),
      expect.stringContaining("propagation step failed"),
    );

    // Second ancestor was still attempted
    expect(callCount).toBe(2);
  });

  // ── Test 12: running same investment twice → idempotent ──────────────────

  it("12. running propagation twice for the same investment creates only one event per ancestor", async () => {
    mockChain(INVESTOR_ID, [SPONSOR_A_ID]);

    // First run: no existing event → event created
    const mockTxFirst = makeMockTx({ existingEvent: null });
    (prisma as unknown as PrismaMock).$transaction.mockImplementationOnce(
      async (cb: (tx: unknown) => unknown) => cb(mockTxFirst),
    );

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CREATED");
    expect(mockTxFirst.salaryBusinessEvent.create).toHaveBeenCalledTimes(1);

    // Second run: existing event found → no create
    const mockTxSecond = makeMockTx({ existingEvent: { id: "evt-already-exists" } });
    (prisma as unknown as PrismaMock).$transaction.mockImplementationOnce(
      async (cb: (tx: unknown) => unknown) => cb(mockTxSecond),
    );

    await propagateInvestmentBusiness(INVESTOR_ID, INVESTMENT_ID, AMOUNT, "INVESTMENT_CREATED");
    expect(mockTxSecond.salaryBusinessEvent.create).not.toHaveBeenCalled();
    expect(mockTxSecond.salaryBusinessSummary.upsert).not.toHaveBeenCalled();
  });

  // ── Unit tests for individual named functions ─────────────────────────────

  describe("creditDirectBusiness", () => {
    it("writes DIRECT + INVESTMENT_CREATED event", async () => {
      const mockTx = makeMockTx();
      setupTx(mockTx);

      const result = await creditDirectBusiness(SPONSOR_A_ID, INVESTOR_ID, INVESTMENT_ID, AMOUNT, 1);

      expect(result).toBe("applied");
      expect(mockTx.salaryBusinessEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId:    SPONSOR_A_ID,
            pool:      "DIRECT",
            eventType: "INVESTMENT_CREATED",
            delta:     AMOUNT,
            depth:     1,
          }),
        }),
      );
    });

    it("returns 'duplicate' when event already exists", async () => {
      const mockTx = makeMockTx({ existingEvent: { id: "existing" } });
      setupTx(mockTx);

      const result = await creditDirectBusiness(SPONSOR_A_ID, INVESTOR_ID, INVESTMENT_ID, AMOUNT, 1);
      expect(result).toBe("duplicate");
    });
  });

  describe("debitDirectBusiness", () => {
    it("writes DIRECT + INVESTMENT_CANCELLED event with negative delta", async () => {
      const mockTx = makeMockTx({
        currentSummary: { directBusiness: "1000.00000000", downlineBusiness: "0", powerBusiness: "0" },
      });
      setupTx(mockTx);

      const result = await debitDirectBusiness(
        SPONSOR_A_ID, INVESTOR_ID, INVESTMENT_ID, AMOUNT, 1, "INVESTMENT_CANCELLED",
      );

      expect(result).toBe("applied");
      expect(mockTx.salaryBusinessEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pool:      "DIRECT",
            eventType: "INVESTMENT_CANCELLED",
            delta:     AMOUNT.negated(),
          }),
        }),
      );
    });

    it("returns 'clamped' when debit exceeds available balance", async () => {
      const mockTx = makeMockTx({
        currentSummary: { directBusiness: "100.00000000", downlineBusiness: "0", powerBusiness: "0" },
      });
      setupTx(mockTx);

      // Debit $500 from a balance of $100
      const result = await debitDirectBusiness(
        SPONSOR_A_ID, INVESTOR_ID, INVESTMENT_ID, AMOUNT, 1, "INVESTMENT_CANCELLED",
      );

      expect(result).toBe("clamped");
    });
  });

  describe("creditPowerBusiness", () => {
    it("writes POWER + POWER_BV_ADDED event with positive delta", async () => {
      const mockTx = makeMockTx();
      setupTx(mockTx);

      const bv = new Prisma.Decimal("2500.00000000");
      const result = await creditPowerBusiness("user-1", "ledger-1", bv);

      expect(result).toBe("applied");
      expect(mockTx.salaryBusinessEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pool:      "POWER",
            eventType: "POWER_BV_ADDED",
            delta:     bv,
            depth:     null,
          }),
        }),
      );
    });
  });

  describe("debitPowerBusiness", () => {
    it("writes POWER + POWER_BV_REMOVED event with negative delta", async () => {
      const mockTx = makeMockTx({
        currentSummary: { directBusiness: "0", downlineBusiness: "0", powerBusiness: "5000.00000000" },
      });
      setupTx(mockTx);

      const bv = new Prisma.Decimal("1000.00000000");
      const result = await debitPowerBusiness("user-1", "ledger-1", bv);

      expect(result).toBe("applied");
      expect(mockTx.salaryBusinessEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pool:      "POWER",
            eventType: "POWER_BV_REMOVED",
            delta:     bv.negated(),
          }),
        }),
      );
    });
  });
});
