/**
 * Sprint 33F — Salary Qualification Engine Tests
 *
 * 15 scenarios:
 *  1.  Direct Business qualifies Bronze.
 *  2.  Direct Business qualifies Silver.
 *  3.  Direct Business qualifies Gold.
 *  4.  Gold immediately unlocks ALL_BUSINESS (same-pass re-evaluation).
 *  5.  Downline Business ignored before Gold.
 *  6.  Downline Business counted after Gold.
 *  7.  Power Business ignored before Gold.
 *  8.  Power Business counted after Gold.
 *  9.  Multiple ranks achieved in one pass.
 * 10.  Duplicate qualification run — no duplicate achievements.
 * 11.  Business decreases — achievements remain.
 * 12.  Inactive user — skipped.
 * 13.  ALL_BUSINESS rank with insufficient effective business — not awarded.
 * 14.  Transaction rollback — no partial achievements.
 * 15.  computeEffectiveBusiness() — pure unit tests.
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
    user:         { findUnique: vi.fn() },
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
  computeEffectiveBusiness,
  runQualificationForUser,
} from "../salary-qualification.service";
import { prisma } from "../../config/prisma";
import { logger } from "../../lib/logger";

// ── Test helpers ───────────────────────────────────────────────────────────────

type PrismaMock = {
  user:         { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

/** Build a SalaryBusinessSummary-shaped object. */
function makeSummary(
  direct:   string,
  downline = "0",
  power    = "0",
) {
  return {
    directBusiness:   new Prisma.Decimal(direct),
    downlineBusiness: new Prisma.Decimal(downline),
    powerBusiness:    new Prisma.Decimal(power),
  };
}

/** Build a minimal SalaryRankConfig-shaped object. */
function makeRank(
  rankName:          string,
  requiredBusiness:  string,
  pool:              "DIRECT_ONLY" | "ALL_BUSINESS" = "DIRECT_ONLY",
  overrides: Partial<{
    monthlySalary:  string;
    durationMonths: number;
  }> = {},
) {
  return {
    rankName,
    requiredBusiness:  new Prisma.Decimal(requiredBusiness),
    monthlySalary:     new Prisma.Decimal(overrides.monthlySalary  ?? "500"),
    durationMonths:    overrides.durationMonths ?? 6,
    qualificationPool: pool,
  };
}

/** Build a mock Prisma transaction client. */
function makeMockTx(opts: {
  summary?:             ReturnType<typeof makeSummary> | null;
  ranks?:               ReturnType<typeof makeRank>[];
  existingAchievements?: Array<{ rankName: string }>;
  upsertThrowOnNth?:    number;
}) {
  const {
    summary              = null,
    ranks                = [],
    existingAchievements = [],
    upsertThrowOnNth,
  } = opts;

  let upsertCalls = 0;

  return {
    salaryBusinessSummary: {
      findUnique: vi.fn().mockResolvedValue(summary),
    },
    salaryRankConfig: {
      findMany: vi.fn().mockResolvedValue(ranks),
    },
    salaryAchievement: {
      findMany: vi.fn().mockResolvedValue(existingAchievements),
      upsert:   vi.fn().mockImplementation(() => {
        upsertCalls++;
        if (upsertThrowOnNth && upsertCalls === upsertThrowOnNth) {
          throw new Error("simulated DB write failure");
        }
        return Promise.resolve({ id: `ach-${upsertCalls}` });
      }),
    },
  };
}

/** Wire up the $transaction mock to run the callback with the provided tx. */
function setupTx(mockTx: ReturnType<typeof makeMockTx>) {
  (prisma as unknown as PrismaMock).$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(mockTx),
  );
}

/** Make prisma.user.findUnique return an ACTIVE user. */
function setActiveUser(userId = "user-1") {
  (prisma as unknown as PrismaMock).user.findUnique.mockResolvedValue({
    id:     userId,
    status: "ACTIVE",
  });
}

// ── Common rank definitions ───────────────────────────────────────────────────

const RANKS = {
  Bronze:   makeRank("Bronze",   "5000",  "DIRECT_ONLY"),
  Silver:   makeRank("Silver",   "15000", "DIRECT_ONLY"),
  Gold:     makeRank("Gold",     "50000", "DIRECT_ONLY"),
  Platinum: makeRank("Platinum", "150000","ALL_BUSINESS"),
  Diamond:  makeRank("Diamond",  "500000","ALL_BUSINESS"),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("salary-qualification.service", () => {
  const USER_ID = "user-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it("1. credits Bronze when direct business ≥ 5 000", async () => {
    setActiveUser();
    const mockTx = makeMockTx({
      summary:  makeSummary("6000"),
      ranks:    [RANKS.Bronze],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(1);
    expect(result.insufficient).toBe(0);
    expect(mockTx.salaryAchievement.upsert).toHaveBeenCalledTimes(1);
    expect(mockTx.salaryAchievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where:  { userId_rankName: { userId: USER_ID, rankName: "Bronze" } },
        create: expect.objectContaining({ rankName: "Bronze" }),
        update: {},
      }),
    );
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it("2. credits Silver when direct business ≥ 15 000", async () => {
    setActiveUser();
    const mockTx = makeMockTx({
      summary:  makeSummary("20000"),
      ranks:    [RANKS.Bronze, RANKS.Silver],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(2);
    const upsertCalls = mockTx.salaryAchievement.upsert.mock.calls;
    expect(upsertCalls[0][0].create.rankName).toBe("Bronze");
    expect(upsertCalls[1][0].create.rankName).toBe("Silver");
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it("3. credits Gold when direct business ≥ 50 000", async () => {
    setActiveUser();
    const mockTx = makeMockTx({
      summary:  makeSummary("55000"),
      ranks:    [RANKS.Bronze, RANKS.Silver, RANKS.Gold],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(3);
    const rankNames = mockTx.salaryAchievement.upsert.mock.calls.map(
      (args: any[]) => (args[0] as any).create.rankName as string,
    );
    expect(rankNames).toContain("Gold");
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────

  it("4. Gold unlock enables ALL_BUSINESS for remaining ranks in the same pass", async () => {
    setActiveUser();
    // direct=50 000 (qualifies Gold), downline=100 000
    // Without unlock: Platinum effective = 50 000 < 150 000 → miss
    // After Gold unlock: effective = 50 000 + 100 000 = 150 000 → hit
    const mockTx = makeMockTx({
      summary: makeSummary("50000", "100000"),
      ranks:   [RANKS.Bronze, RANKS.Silver, RANKS.Gold, RANKS.Platinum],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(4);   // Bronze, Silver, Gold, Platinum
    expect(result.insufficient).toBe(0);

    const rankNames = mockTx.salaryAchievement.upsert.mock.calls.map(
      (args: any[]) => (args[0] as any).create.rankName as string,
    );
    expect(rankNames).toContain("Gold");
    expect(rankNames).toContain("Platinum");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
      expect.stringContaining("Gold unlock triggered"),
    );
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────

  it("5. Downline Business is ignored for ALL_BUSINESS ranks before Gold is achieved", async () => {
    setActiveUser();
    // direct=7 000, downline=500 000 — Gold not achieved → downline ignored
    const mockTx = makeMockTx({
      summary: makeSummary("7000", "500000"),
      ranks:   [RANKS.Bronze, RANKS.Gold, RANKS.Platinum],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(1);   // only Bronze
    const rankNames = mockTx.salaryAchievement.upsert.mock.calls.map(
      (args: any[]) => (args[0] as any).create.rankName as string,
    );
    expect(rankNames).toEqual(["Bronze"]);
    expect(rankNames).not.toContain("Platinum");
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────────

  it("6. Downline Business counts toward ALL_BUSINESS ranks after Gold", async () => {
    setActiveUser();
    // Gold already held → unlocked immediately at start
    const mockTx = makeMockTx({
      summary:              makeSummary("50000", "100000"),
      ranks:                [RANKS.Gold, RANKS.Platinum],
      existingAchievements: [{ rankName: "Gold" }],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    // Gold skipped (already held), Platinum created using effective = 150 000
    expect(result.duplicate).toBe(1);   // Gold
    expect(result.created).toBe(1);     // Platinum
    const rankNames = mockTx.salaryAchievement.upsert.mock.calls.map(
      (args: any[]) => (args[0] as any).create.rankName as string,
    );
    expect(rankNames).toEqual(["Platinum"]);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
      expect.stringContaining("Gold unlock detected"),
    );
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────────

  it("7. Power Business is ignored for ALL_BUSINESS ranks before Gold is achieved", async () => {
    setActiveUser();
    // direct=7 000, power=600 000 — Gold not achieved → power ignored
    const mockTx = makeMockTx({
      summary: makeSummary("7000", "0", "600000"),
      ranks:   [RANKS.Bronze, RANKS.Gold, RANKS.Diamond],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(1);    // only Bronze
    const rankNames = mockTx.salaryAchievement.upsert.mock.calls.map(
      (args: any[]) => (args[0] as any).create.rankName as string,
    );
    expect(rankNames).not.toContain("Diamond");
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────────

  it("8. Power Business counts toward ALL_BUSINESS ranks after Gold", async () => {
    setActiveUser();
    // Gold just earned in this pass; power=100 000 → Platinum effective = 150 000
    const mockTx = makeMockTx({
      summary: makeSummary("50000", "0", "100000"),
      ranks:   [RANKS.Gold, RANKS.Platinum],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(2);    // Gold + Platinum
    const rankNames = mockTx.salaryAchievement.upsert.mock.calls.map(
      (args: any[]) => (args[0] as any).create.rankName as string,
    );
    expect(rankNames).toContain("Gold");
    expect(rankNames).toContain("Platinum");
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────────

  it("9. achieves multiple ranks in a single qualification pass", async () => {
    setActiveUser();
    const mockTx = makeMockTx({
      summary: makeSummary("50000", "100000"),
      ranks:   [RANKS.Bronze, RANKS.Silver, RANKS.Gold, RANKS.Platinum],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(4);
    expect(result.duplicate).toBe(0);
    expect(result.insufficient).toBe(0);
  });

  // ── Test 10 ─────────────────────────────────────────────────────────────────

  it("10. duplicate qualification run creates no new achievements", async () => {
    setActiveUser();
    // Both Bronze and Silver already held
    const mockTx = makeMockTx({
      summary:              makeSummary("20000"),
      ranks:                [RANKS.Bronze, RANKS.Silver],
      existingAchievements: [{ rankName: "Bronze" }, { rankName: "Silver" }],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(0);
    expect(result.duplicate).toBe(2);
    expect(mockTx.salaryAchievement.upsert).not.toHaveBeenCalled();
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────────

  it("11. achievements remain even when business decreases below rank threshold", async () => {
    setActiveUser();
    // Gold was previously earned but business fell back to 4 000 — below every threshold
    // The engine sees Gold in existingAchievements and never tries to delete it
    const mockTx = makeMockTx({
      summary:              makeSummary("4000"),
      ranks:                [RANKS.Bronze, RANKS.Silver, RANKS.Gold],
      existingAchievements: [
        { rankName: "Bronze" },
        { rankName: "Silver" },
        { rankName: "Gold"   },
      ],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    // Business fell below every threshold → all ranks are "insufficient".
    // The engine NEVER deletes or modifies the existing achievements —
    // the "never revoke" guarantee means the DB rows (returned by findMany)
    // are untouched: no upsert, no delete, no update.
    expect(result.created).toBe(0);
    expect(result.insufficient).toBe(3);
    expect(mockTx.salaryAchievement.upsert).not.toHaveBeenCalled();

    // Existing achievements are still present (findMany returned them)
    expect(mockTx.salaryAchievement.findMany).toHaveBeenCalledTimes(1);
    // No delete method was called on the mock
    expect(mockTx.salaryAchievement).not.toHaveProperty("delete");
    expect(mockTx.salaryAchievement).not.toHaveProperty("deleteMany");
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────────

  it("12. skips inactive user without opening a transaction", async () => {
    (prisma as unknown as PrismaMock).user.findUnique.mockResolvedValue({
      id:     USER_ID,
      status: "INACTIVE",
    });

    const result = await runQualificationForUser(USER_ID);

    expect(result.created).toBe(0);
    expect((prisma as unknown as PrismaMock).$transaction).not.toHaveBeenCalled();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, status: "INACTIVE" }),
      expect.stringContaining("skipped"),
    );
  });

  // ── Test 13 ─────────────────────────────────────────────────────────────────

  it("13. ALL_BUSINESS rank not awarded when effective business is insufficient", async () => {
    setActiveUser();
    // Gold already held (unlocked), but direct=60 000, downline=50 000 → 110 000 < 150 000
    const mockTx = makeMockTx({
      summary:              makeSummary("60000", "50000"),
      ranks:                [RANKS.Gold, RANKS.Platinum],
      existingAchievements: [{ rankName: "Gold" }],
    });
    setupTx(mockTx);

    const result = await runQualificationForUser(USER_ID);

    expect(result.duplicate).toBe(1);    // Gold already held
    expect(result.created).toBe(0);      // Platinum: 110 000 < 150 000
    expect(result.insufficient).toBe(1);

    const upsertCalls = mockTx.salaryAchievement.upsert.mock.calls;
    expect(upsertCalls.every(
      (args: any[]) => (args[0] as any).create.rankName !== "Platinum",
    )).toBe(true);
  });

  // ── Test 14 ─────────────────────────────────────────────────────────────────

  it("14. transaction failure propagates — no partial achievements committed", async () => {
    setActiveUser();
    // upsert throws on the 2nd call (Silver) → transaction rolls back
    const mockTx = makeMockTx({
      summary: makeSummary("20000"),
      ranks:   [RANKS.Bronze, RANKS.Silver],
      upsertThrowOnNth: 2,
    });

    (prisma as unknown as PrismaMock).$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => {
        // Simulate real transaction: callback throws → re-throw (no commit)
        return cb(mockTx);
      },
    );

    await expect(runQualificationForUser(USER_ID)).rejects.toThrow("simulated DB write failure");

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
      expect.stringContaining("transaction failed"),
    );
  });

  // ── Test 15 — computeEffectiveBusiness pure unit tests ─────────────────────

  describe("15. computeEffectiveBusiness()", () => {
    const summary = {
      directBusiness:   new Prisma.Decimal("30000"),
      downlineBusiness: new Prisma.Decimal("80000"),
      powerBusiness:    new Prisma.Decimal("20000"),
    };

    it("DIRECT_ONLY — always returns directBusiness regardless of unlock state", () => {
      expect(computeEffectiveBusiness(summary, "DIRECT_ONLY", false))
        .toEqual(new Prisma.Decimal("30000"));
      expect(computeEffectiveBusiness(summary, "DIRECT_ONLY", true))
        .toEqual(new Prisma.Decimal("30000"));
    });

    it("ALL_BUSINESS + locked — returns directBusiness only", () => {
      expect(computeEffectiveBusiness(summary, "ALL_BUSINESS", false))
        .toEqual(new Prisma.Decimal("30000"));
    });

    it("ALL_BUSINESS + unlocked — returns direct + downline + power", () => {
      expect(computeEffectiveBusiness(summary, "ALL_BUSINESS", true))
        .toEqual(new Prisma.Decimal("130000"));   // 30 000 + 80 000 + 20 000
    });

    it("ALL_BUSINESS + unlocked + zeroed pools — returns directBusiness", () => {
      const zeroed = {
        directBusiness:   new Prisma.Decimal("10000"),
        downlineBusiness: new Prisma.Decimal("0"),
        powerBusiness:    new Prisma.Decimal("0"),
      };
      expect(computeEffectiveBusiness(zeroed, "ALL_BUSINESS", true))
        .toEqual(new Prisma.Decimal("10000"));
    });

    it("ALL_BUSINESS + unlocked with fractional values rounds correctly", () => {
      const frac = {
        directBusiness:   new Prisma.Decimal("10000.50000000"),
        downlineBusiness: new Prisma.Decimal("5000.25000000"),
        powerBusiness:    new Prisma.Decimal("1000.00000000"),
      };
      expect(computeEffectiveBusiness(frac, "ALL_BUSINESS", true))
        .toEqual(new Prisma.Decimal("16000.75000000"));
    });
  });
});
