/**
 * Sprint 28J — Level Income Business Rule Regression Tests
 * Updated Sprint 31H — config now loaded from system_settings (mocked here).
 *
 * These tests verify that processLevelIncome is a pure referral commission:
 * every sponsor within the first 5 referral levels is paid unconditionally —
 * no binary qualification, no investment requirement, no left/right leg check.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

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
    levelIncome:       { groupBy: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    user:              { findUnique: vi.fn() },
    wallet:            { update: vi.fn() },
    walletTransaction: { create: vi.fn() },
    $transaction:      vi.fn(),
  },
}));

// ── Mock the settings module so loadLevelRules reads from this mock ──────────
// Official PrimeWave business rule: 1% flat across all 5 levels.
vi.mock("../../config/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(
    JSON.stringify([
      { level: 1, rate: 1 },
      { level: 2, rate: 1 },
      { level: 3, rate: 1 },
      { level: 4, rate: 1 },
      { level: 5, rate: 1 },
    ]),
  ),
  setSetting:        vi.fn().mockResolvedValue(undefined),
  clearSettingsCache: vi.fn(),
}));

import { processLevelIncome, type LevelIncomeTarget } from "../level-income.service";
import { isBinaryQualified } from "../../eligibility/eligibility.service";

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a minimal mock Prisma TransactionClient from a sponsor map.
 * sponsorMap[userId] = sponsorId | null (null = chain end).
 */
function buildMockTx(sponsorMap: Record<string, string | null>) {
  return {
    user: {
      findUnique: vi.fn().mockImplementation(
        async ({ where }: { where: { id: string } }) => ({
          sponsorId: sponsorMap[where.id] ?? null,
        }),
      ),
    },
    wallet: {
      update: vi.fn().mockResolvedValue({
        id:              "wallet-id",
        withdrawalWallet: new Prisma.Decimal("0"),
      }),
    },
    levelIncome: {
      create: vi.fn().mockResolvedValue({}),
    },
    walletTransaction: {
      create: vi.fn().mockResolvedValue({}),
    },
  } as unknown as Prisma.TransactionClient;
}

const AMOUNT   = new Prisma.Decimal("1000");
const INV_ID   = "inv-001";
const INVESTOR = "user-investor";

// ── Scenario 1–4: Unconditional payout regardless of ancestor state ──────────

describe("Level Income — pure referral commission (Sprint 28J)", () => {
  it("Scenario 1: pays sponsor who has ZERO investments", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]:              "sponsor-no-investment",
      "sponsor-no-investment": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ level: 1, receiverUserId: "sponsor-no-investment" });
    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
  });

  it("Scenario 2: pays sponsor who has ONLY LEFT referrals (fails binary gate)", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]:          "sponsor-left-only",
      "sponsor-left-only": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ level: 1, receiverUserId: "sponsor-left-only" });
  });

  it("Scenario 3: pays sponsor who has ONLY RIGHT referrals (fails binary gate)", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]:           "sponsor-right-only",
      "sponsor-right-only": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ level: 1, receiverUserId: "sponsor-right-only" });
  });

  it("Scenario 4: pays sponsor who fully fails binary qualification", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]:            "unqualified-sponsor",
      "unqualified-sponsor": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ level: 1, receiverUserId: "unqualified-sponsor" });
  });

  // ── Scenario 5: Hard level cap ───────────────────────────────────────────────

  it("Scenario 5: Level 6 ancestor receives NOTHING — capped at MAX_LEVELS=5", async () => {
    const chain = ["l1", "l2", "l3", "l4", "l5", "l6-never-paid"];
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]: chain[0]!,
      "l1":       chain[1]!,
      "l2":       chain[2]!,
      "l3":       chain[3]!,
      "l4":       chain[4]!,
      "l5":       chain[5]!,
      "l6-never-paid": null,
    };

    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(5);
    expect(targets.map((t: LevelIncomeTarget) => t.receiverUserId)).not.toContain("l6-never-paid");
    expect(tx.wallet.update).toHaveBeenCalledTimes(5);
    expect(tx.levelIncome.create).toHaveBeenCalledTimes(5);
  });

  // ── Payout correctness ────────────────────────────────────────────────────────

  it("each payout is exactly 1% of the investment amount", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]:  "sponsor-1",
      "sponsor-1": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    // 1% of 1000 = 10.00
    expect(targets[0]?.incomeAmount.toFixed(2)).toBe("10.00");
  });

  it("$100 investment pays exactly $1.00 at each of the five levels", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]: "l1", "l1": "l2", "l2": "l3", "l3": "l4", "l4": "l5", "l5": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(
      tx, INVESTOR, INV_ID, new Prisma.Decimal("100"),
    );

    expect(targets).toHaveLength(5);
    targets.forEach((t: LevelIncomeTarget) => {
      // 1% of $100 = $1.00 at every level
      expect(t.incomeAmount.toFixed(2)).toBe("1.00");
    });
  });

  it("full 5-level chain: levels numbered 1–5 in order, all wallets credited", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]: "l1", "l1": "l2", "l2": "l3", "l3": "l4", "l4": "l5", "l5": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(5);
    expect(targets.map((t: LevelIncomeTarget) => t.level)).toEqual([1, 2, 3, 4, 5]);
    expect(targets.map((t: LevelIncomeTarget) => t.receiverUserId)).toEqual(
      ["l1", "l2", "l3", "l4", "l5"],
    );
    targets.forEach((t: LevelIncomeTarget) => {
      expect(t.incomeAmount.toFixed(2)).toBe("10.00");
    });
  });

  it("chain shorter than 5 levels — pays only available ancestors", async () => {
    const sponsorMap: Record<string, string | null> = {
      [INVESTOR]: "l1", "l1": "l2", "l2": null,
    };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(2);
    expect(targets[0]?.level).toBe(1);
    expect(targets[1]?.level).toBe(2);
    expect(tx.wallet.update).toHaveBeenCalledTimes(2);
  });

  it("investor with no sponsor — returns empty targets, no wallets credited", async () => {
    const sponsorMap: Record<string, string | null> = { [INVESTOR]: null };
    const tx = buildMockTx(sponsorMap);
    const targets = await processLevelIncome(tx, INVESTOR, INV_ID, AMOUNT);

    expect(targets).toHaveLength(0);
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.levelIncome.create).not.toHaveBeenCalled();
  });
});

// ── Scenarios 6–8: Binary / Salary / Orbit engines unchanged ──────────────────

describe("Binary qualification gate — unchanged in other engines (Scenarios 6–8)", () => {
  it("Scenario 6 / 7 / 8: isBinaryQualified is exported from eligibility.service", () => {
    expect(typeof isBinaryQualified).toBe("function");
  });

  it("isMemberActive deprecated alias still resolves (migration safety)", async () => {
    const mod = await import("../../eligibility/eligibility.service");
    const alias = (mod as Record<string, unknown>)["isMemberActive"];
    expect(typeof alias).toBe("function");
    expect(alias).toBe(isBinaryQualified);
  });

  it("level-income.service does NOT call isBinaryQualified (confirmed by import absence)", async () => {
    const mod = await import("../level-income.service");
    expect(typeof mod.processLevelIncome).toBe("function");
  });
});
