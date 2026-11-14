/**
 * Sprint 28K — Progressive Investment Rule: Validation Tests
 *
 * Business rule:
 *   Let N = number of completed (any status) investments for a user.
 *   Minimum investment = (N + 1) × $100
 *   Amount must be a whole-dollar multiple of $100.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
    investment:        { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    wallet:            { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    walletTransaction: { create: vi.fn() },
    levelIncome:       { create: vi.fn() },
    user:              { findUnique: vi.fn() },
    $transaction:      vi.fn(),
  },
}));

vi.mock("../../binary/bv.service", () => ({
  propagateBV: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../single-plan.service", () => ({
  lockSinglePlanAccount: vi.fn().mockResolvedValue({}),
  contributeSinglePlan: vi.fn().mockResolvedValue(undefined),
  qualifySinglePlanTx: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../salary/salary-business.service", () => ({
  propagateInvestmentBusiness: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../ledger/ledger.service", () => ({
  writeLedgerEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../levelIncome", () => ({
  processLevelIncome: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../notifications/notifications.service", () => ({
  notificationService: { create: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../salary/salary-achievement.service", () => ({
  processUserAchievements: vi.fn().mockResolvedValue(undefined),
}));

import { createInvestmentSchema } from "../investments.schema";
import { createInvestment } from "../investments.service";
import { prisma } from "../../config/prisma";

// ── Helpers ────────────────────────────────────────────────────────────────────

type PrismaMock = {
  investment: { count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  wallet: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  walletTransaction: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

/**
 * Wire up the prisma.$transaction mock so that the callback receives a
 * mini-tx object that delegates count/findUnique/wallet/create calls.
 */
function setupTransaction(existingInvestmentCount: number, depositBalance: number) {
  const mock = prisma as unknown as PrismaMock;

  // $transaction runs the callback with the mock tx
  mock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    const mockTx = {
      investment: {
        count: vi.fn().mockResolvedValue(existingInvestmentCount),
        create: vi.fn().mockResolvedValue({
          id: "inv-test",
          userId: "user-test",
          amount: { toFixed: () => "100.00" },
          planType: "SINGLE",
          dailyROI: { toFixed: () => "0.8000" },
          durationDays: 360,
          autoCompound: false,
          claimableROI: { toFixed: () => "0.00" },
          claimablePrincipal: { toFixed: () => "0.00" },
          status: "ACTIVE",
          startedAt: new Date(),
          maturesAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
        }),
      },
      wallet: {
        findUnique: vi.fn().mockResolvedValue({
          id: "wallet-test",
          depositWallet: { lessThan: (v: unknown) => false, toFixed: () => depositBalance.toFixed(8) },
        }),
        update: vi.fn().mockResolvedValue({ id: "wallet-test" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      walletTransaction: { create: vi.fn().mockResolvedValue({}) },
      levelIncome:       { create: vi.fn().mockResolvedValue({}) },
      user:              { findUnique: vi.fn().mockResolvedValue({ sponsorId: null }) },
    };
    return cb(mockTx);
  });
}

// ── Part A: Schema-level validation (amount must be multiple of $100) ─────────

describe("createInvestmentSchema — amount multiple of $100", () => {
  const base = { planType: "SINGLE" as const };

  it("REJECTED: $50 — not a multiple of $100", () => {
    const result = createInvestmentSchema.safeParse({ ...base, amount: 50 });
    expect(result.success).toBe(false);
  });

  it("ACCEPTED: $100 — exactly $100", () => {
    const result = createInvestmentSchema.safeParse({ ...base, amount: 100 });
    expect(result.success).toBe(true);
  });

  it("ACCEPTED: $500 — multiple of $100", () => {
    const result = createInvestmentSchema.safeParse({ ...base, amount: 500 });
    expect(result.success).toBe(true);
  });

  it("REJECTED: $150 — not a multiple of $100", () => {
    const result = createInvestmentSchema.safeParse({ ...base, amount: 150 });
    expect(result.success).toBe(false);
  });

  it("REJECTED: $250 (non-multiple) — rejected at schema level", () => {
    const result = createInvestmentSchema.safeParse({ ...base, amount: 250 });
    expect(result.success).toBe(false);
  });

  it("ACCEPTED: $1000 — multiple of $100", () => {
    const result = createInvestmentSchema.safeParse({ ...base, amount: 1000 });
    expect(result.success).toBe(true);
  });

  it("REJECTED: $0 — not positive", () => {
    const result = createInvestmentSchema.safeParse({ ...base, amount: 0 });
    expect(result.success).toBe(false);
  });
});

// ── Part B: Service-level validation (progressive minimum) ────────────────────

describe("createInvestment — progressive minimum rule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // First investment: minimum = (0+1) × $100 = $100
  it("REJECTED: $50 fails amount validation before the progressive minimum check", async () => {
    setupTransaction(0, 1000);
    await expect(
      createInvestment("user-1", { amount: 50, planType: "SINGLE", autoCompound: false }),
    ).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("ACCEPTED: 1st investment $100 — exactly minimum", async () => {
    setupTransaction(0, 1000);
    await expect(
      createInvestment("user-1", { amount: 100, planType: "SINGLE", autoCompound: false }),
    ).resolves.toBeDefined();
  });

  it("ACCEPTED: 1st investment $500 — above minimum $100", async () => {
    setupTransaction(0, 5000);
    await expect(
      createInvestment("user-1", { amount: 500, planType: "SINGLE", autoCompound: false }),
    ).resolves.toBeDefined();
  });

  // Second investment: minimum = (1+1) × $100 = $200
  it("REJECTED: 2nd investment $100 — below minimum $200", async () => {
    setupTransaction(1, 1000);
    await expect(
      createInvestment("user-1", { amount: 100, planType: "SINGLE", autoCompound: false }),
    ).rejects.toMatchObject({
      code: "BELOW_MINIMUM_INVESTMENT",
    });
  });

  it("REJECTED: 2nd investment $150 — below minimum $200 (also non-multiple, schema rejects first)", async () => {
    // Schema rejects $150 before reaching the service
    const schema = createInvestmentSchema.safeParse({ amount: 150, planType: "SINGLE" });
    expect(schema.success).toBe(false);
  });

  it("ACCEPTED: 2nd investment $200 — exactly minimum", async () => {
    setupTransaction(1, 2000);
    await expect(
      createInvestment("user-1", { amount: 200, planType: "SINGLE", autoCompound: false }),
    ).resolves.toBeDefined();
  });

  it("ACCEPTED: 2nd investment $700 — above minimum $200", async () => {
    setupTransaction(1, 7000);
    await expect(
      createInvestment("user-1", { amount: 700, planType: "SINGLE", autoCompound: false }),
    ).resolves.toBeDefined();
  });

  // Third investment: minimum = (2+1) × $100 = $300
  it("REJECTED: 3rd investment $200 — below minimum $300", async () => {
    setupTransaction(2, 5000);
    await expect(
      createInvestment("user-1", { amount: 200, planType: "SINGLE", autoCompound: false }),
    ).rejects.toMatchObject({
      code: "BELOW_MINIMUM_INVESTMENT",
    });
  });

  it("ACCEPTED: 3rd investment $300 — exactly minimum", async () => {
    setupTransaction(2, 3000);
    await expect(
      createInvestment("user-1", { amount: 300, planType: "SINGLE", autoCompound: false }),
    ).resolves.toBeDefined();
  });

  it("ACCEPTED: 3rd investment $1000 — well above minimum $300", async () => {
    setupTransaction(2, 10000);
    await expect(
      createInvestment("user-1", { amount: 1000, planType: "SINGLE", autoCompound: false }),
    ).resolves.toBeDefined();
  });
});

// ── Part C: Regression — minimum message is accurate ─────────────────────────

describe("Progressive minimum — error message accuracy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("error message states the correct minimum for the nth investment", async () => {
    setupTransaction(3, 1000); // 4th investment, minimum = $400
    await expect(
      createInvestment("user-1", { amount: 100, planType: "SINGLE", autoCompound: false }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("$400"),
    });
  });
});
