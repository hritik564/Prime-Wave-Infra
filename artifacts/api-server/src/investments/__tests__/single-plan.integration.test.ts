/**
 * Opt-in REAL Development PostgreSQL tests. No seeds/resets/global cycles.
 * Only uniquely generated fixture users and their dependent rows are mutated.
 * Run: RUN_SINGLE_PLAN_DB_TESTS=1 pnpm exec vitest run .../single-plan.integration.test.ts
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

vi.mock("../../binary/bv.service", () => ({ propagateBV: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../levelIncome", () => ({ processLevelIncome: vi.fn().mockResolvedValue([]) }));
vi.mock("../../notifications/notifications.service", () => ({ notificationService: { create: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../../salary/salary-achievement.service", () => ({ processUserAchievements: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../salary/salary-business.service", () => ({ propagateInvestmentBusiness: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../ledger/ledger.service", () => ({ writeLedgerEntry: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "../../config/prisma";
import { createInvestment, claimPrincipal, listInvestments, updateAutoCompound } from "../investments.service";
import { claimRoi } from "../roi.service";
import { getSinglePlanSummary, postSinglePlanMemberCycle, refreshSinglePlanQualification } from "../single-plan.service";
import { createInvestmentSchema } from "../investments.schema";
import { getPlans, saveConfigField, updatePlanConfig, updatePlanStatus } from "../../admin/admin-plans.service";

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
const boundary = new Date("2026-11-14T12:00:00Z");
const next = new Date("2026-11-15T00:00:00Z");
const ids: string[] = [];
const enabled = process.env["RUN_SINGLE_PLAN_DB_TESTS"] === "1";

async function member() {
  const key = `spcheck_${randomUUID().replaceAll("-", "")}`;
  const user = await prisma.user.create({ data: {
    username: key, email: `${key}@example.invalid`, referralCode: key,
    firstName: "Financial", lastName: "Fixture", passwordHash: "non-login-test-fixture",
    wallet: { create: { depositWallet: D(10000) } },
  } });
  ids.push(user.id);
  return user.id;
}
async function single(userId: string, amount = 100, autoCompound = false) {
  const inv = await createInvestment(userId, { planType: "SINGLE", amount, autoCompound });
  return prisma.investment.update({ where: { id: inv.id },
    data: { startedAt: new Date(boundary.getTime() - 86_400_000 + ids.length) } });
}
async function legacy(userId: string) {
  return prisma.investment.create({ data: {
    userId, amount: D(100), currentPrincipal: D(100), dailyROI: D("0.5"),
    planType: "PLAN_90", durationDays: 90, maturesAt: new Date("2027-01-01T00:00:00Z"),
    startedAt: new Date("2026-10-01T00:00:00Z"),
  } });
}
async function earned(userId: string, investmentId: string, amount: string, compounded = false) {
  const value = D(amount);
  await prisma.$transaction(async tx => {
    await tx.roiLedger.create({ data: { userId, investmentId, amount: value, cycleNumber: 1,
      cycleKey: "fixture-earlier", wasCompounded: compounded } });
    await tx.singlePlanEvent.create({ data: { userId, investmentId, kind: "ROI_ACCRUAL", amount: value,
      key: `fixture-earned:${investmentId}`, metadata: { compounded } } });
    await tx.investment.update({ where: { id: investmentId }, data: compounded
      ? { currentPrincipal: { increment: value } } : { claimableROI: { increment: value } } });
    await tx.singlePlanAccount.update({ where: { userId }, data: {
      roiAccrued: { increment: value }, ...(compounded
        ? { roiCompounded: { increment: value } } : { claimableRoi: { increment: value } }),
    } });
  });
}
async function referrals(owner: string) {
  const left = await member(), right = await member();
  for (const [id, position] of [[left, "LEFT"], [right, "RIGHT"]] as const) {
    await prisma.user.update({ where: { id }, data: { sponsorId: owner, binaryParentId: owner, position } });
    await legacy(id);
  }
  return { left, right };
}
async function cleanup() {
  if (!ids.length) return;
  const where = { userId: { in: [...ids] } };
  await prisma.$transaction(async tx => {
    await tx.singlePlanEvent.deleteMany({ where });
    await tx.singlePlanCycle.deleteMany({ where });
    await tx.roiLedger.deleteMany({ where });
    await tx.singlePlanAccount.deleteMany({ where });
    await tx.walletTransaction.deleteMany({ where });
    await tx.investment.deleteMany({ where });
    await tx.wallet.deleteMany({ where });
    await tx.user.updateMany({ where: { id: { in: [...ids] } }, data: { sponsorId: null, binaryParentId: null } });
    await tx.user.deleteMany({ where: { id: { in: [...ids] } } });
  });
  ids.length = 0;
}

describe.skipIf(!enabled)("SINGLE financial invariants — isolated Development fixtures", () => {
  beforeAll(async () => {
    const [db] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (db?.name !== "heliumdb" || process.env["NODE_ENV"] !== "test") throw new Error("Development-only database test guard failed");
  });
  afterEach(cleanup);
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it("records only actual fresh funding; new capital expands the shared pool", async () => {
    const userId = await member();
    await single(userId);
    await single(userId, 200);
    const summary = await getSinglePlanSummary(userId);
    expect(summary.originalCapital.toString()).toBe("300");
    expect(summary.maxRoi.toString()).toBe("600");
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).depositWallet.toString()).toBe("9700");
    expect(await prisma.singlePlanEvent.count({ where: { userId, kind: "CONTRIBUTION" } })).toBe(2);
  });
  it("$100 non-working capital stops at exactly $200 ROI with a partial final posting", async () => {
    const userId = await member(), inv = await single(userId);
    await earned(userId, inv.id, "199.9");
    await postSinglePlanMemberCycle(userId, boundary);
    await postSinglePlanMemberCycle(userId, next);
    const summary = await getSinglePlanSummary(userId);
    expect(summary.roiAccrued.toString()).toBe("200");
    expect(summary.remainingRoi.toString()).toBe("0");
    expect(summary.principalOwed.toString()).toBe("100");
    expect((await prisma.investment.findUniqueOrThrow({ where: { id: inv.id } })).claimablePrincipal.isZero()).toBe(true);
  });
  it("permanently upgrades to working and caps $100 at $400 ROI", async () => {
    const userId = await member(), inv = await single(userId);
    const { left, right } = await referrals(userId);
    await Promise.all([refreshSinglePlanQualification(userId), refreshSinglePlanQualification(userId)]);
    const first = await getSinglePlanSummary(userId);
    expect(first.tier).toBe(5);
    expect(first.maxRoi.toString()).toBe("400");
    await prisma.user.updateMany({ where: { id: { in: [left, right] } }, data: { status: "SUSPENDED" } });
    await refreshSinglePlanQualification(userId);
    await earned(userId, inv.id, "399.99999999");
    await postSinglePlanMemberCycle(userId, boundary);
    const final = await getSinglePlanSummary(userId);
    expect(final.roiAccrued.toString()).toBe("400");
    expect(final.tier).toBe(5);
    expect(final.qualifiedAt).toEqual(first.qualifiedAt);
    expect(final.qualificationHistory).toHaveLength(1);
  });
  it("does not count spillover, inactive referrals or investment-ineligible referrals", async () => {
    const userId = await member();
    await single(userId);
    const { left, right } = await referrals(userId);
    const otherSponsor = await member();
    await prisma.user.update({ where: { id: right }, data: { sponsorId: otherSponsor } });
    expect((await refreshSinglePlanQualification(userId)).tier).toBe(3);
    await prisma.user.update({ where: { id: right }, data: { sponsorId: userId, status: "SUSPENDED" } });
    expect((await refreshSinglePlanQualification(userId)).tier).toBe(3);
    await prisma.user.update({ where: { id: right }, data: { status: "ACTIVE" } });
    await prisma.investment.updateMany({ where: { userId: right }, data: { status: "COMPLETED" } });
    expect((await refreshSinglePlanQualification(userId)).tier).toBe(3);
    expect(left).not.toBe(right);
  });
  it("recognizes personally sponsored members deep in the actual left and right legs", async () => {
    const userId = await member();
    await single(userId);
    const { left, right } = await referrals(userId);
    const deepLeft = await member(), deepRight = await member();
    await prisma.user.update({ where: { id: deepLeft }, data: { sponsorId: userId, binaryParentId: left, position: "RIGHT" } });
    await prisma.user.update({ where: { id: deepRight }, data: { sponsorId: userId, binaryParentId: right, position: "LEFT" } });
    await prisma.user.updateMany({ where: { id: { in: [left, right] } }, data: { sponsorId: null } });
    await legacy(deepLeft); await legacy(deepRight);
    expect((await refreshSinglePlanQualification(userId)).tier).toBe(5);
  });
  it("shares the last entitlement deterministically across multiple investments", async () => {
    const userId = await member(), first = await single(userId), second = await single(userId, 200);
    await prisma.investment.update({ where: { id: first.id }, data: { startedAt: new Date("2026-11-12T00:00:00Z") } });
    await earned(userId, first.id, "599.7");
    await postSinglePlanMemberCycle(userId, boundary);
    const posted = await prisma.roiLedger.findMany({ where: { userId, cycleKey: boundary.toISOString() } });
    expect(posted).toHaveLength(1);
    expect(posted[0]?.investmentId).toBe(first.id);
    expect(posted[0]?.amount.toString()).toBe("0.3");
    expect((await prisma.investment.findUniqueOrThrow({ where: { id: second.id } })).claimableROI.isZero()).toBe(true);
  });
  it("compounds ROI without expanding original capital or double-counting earned ROI", async () => {
    const userId = await member(), inv = await single(userId, 100, true);
    await postSinglePlanMemberCycle(userId, boundary);
    await postSinglePlanMemberCycle(userId, next);
    const summary = await getSinglePlanSummary(userId);
    expect(summary.originalCapital.toString()).toBe("100");
    expect(summary.maxRoi.toString()).toBe("200");
    expect(summary.roiAccrued.toString()).toBe("0.8016");
    expect(summary.roiCompounded.toString()).toBe("0.8016");
    expect((await prisma.investment.findUniqueOrThrow({ where: { id: inv.id } })).currentPrincipal.toString()).toBe("100.8016");
  });
  it("stops compounding at the cap and resumes only when actual capital expands it", async () => {
    const userId = await member(), inv = await single(userId, 100, true);
    await earned(userId, inv.id, "199.99999999", true);
    await postSinglePlanMemberCycle(userId, boundary);
    expect((await getSinglePlanSummary(userId)).roiAccrued.toString()).toBe("200");
    await single(userId, 200);
    await postSinglePlanMemberCycle(userId, next);
    const summary = await getSinglePlanSummary(userId);
    expect(summary.originalCapital.toString()).toBe("300");
    expect(summary.roiAccrued.gt(200)).toBe(true);
  });
  it("claims ROI once, preserving accrued ROI and supporting old pending ROI after toggling compound", async () => {
    const userId = await member(), inv = await single(userId);
    await postSinglePlanMemberCycle(userId, boundary);
    await updateAutoCompound(userId, inv.id, true);
    const results = await Promise.allSettled([claimRoi(userId, inv.id), claimRoi(userId, inv.id)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const summary = await getSinglePlanSummary(userId);
    expect(summary.roiAccrued.toString()).toBe("0.4");
    expect(summary.roiClaimed.toString()).toBe("0.4");
    expect(summary.claimableRoi.toString()).toBe("0");
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).incomeWallet.toString()).toBe("0.4");
  });
  it("serializes concurrent scheduled/manual runs and duplicate retries", async () => {
    const userId = await member(), inv = await single(userId);
    await earned(userId, inv.id, "199.7");
    await Promise.all([postSinglePlanMemberCycle(userId, boundary), postSinglePlanMemberCycle(userId, boundary),
      postSinglePlanMemberCycle(userId, next)]);
    expect((await getSinglePlanSummary(userId)).roiAccrued.toString()).toBe("200");
    expect(await prisma.roiLedger.count({ where: { userId, cycleKey: { not: "fixture-earlier" } } })).toBe(1);
    expect(await postSinglePlanMemberCycle(userId, boundary)).toBe(0);
  });
  it("serializes concurrent new investments and progressive minimum funding", async () => {
    const userId = await member();
    const result = await Promise.allSettled([single(userId, 100), single(userId, 100)]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await getSinglePlanSummary(userId)).originalCapital.toString()).toBe("100");
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).depositWallet.toString()).toBe("9900");
  });
  it("blocks new-plan principal claims even if a corrupted record is marked matured", async () => {
    const userId = await member(), inv = await single(userId);
    await prisma.investment.update({ where: { id: inv.id }, data: { status: "MATURED", claimablePrincipal: D(100) } });
    await expect(claimPrincipal(userId, inv.id)).rejects.toMatchObject({ code: "PRINCIPAL_SETTLEMENT_DISABLED" });
    expect((await getSinglePlanSummary(userId)).settlement.eligible).toBe(false);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).incomeWallet.isZero()).toBe(true);
  });
  it("models a later qualification after hypothetical 3x settlement without releasing principal again", async () => {
    const userId = await member(), inv = await single(userId);
    await earned(userId, inv.id, "200");
    await claimRoi(userId, inv.id);
    // Fixture-only accounting scenario. No settlement code or payout is executed.
    await prisma.singlePlanAccount.update({ where: { userId }, data: { principalReturned: D(100) } });
    await referrals(userId); await refreshSinglePlanQualification(userId);
    const summary = await getSinglePlanSummary(userId);
    expect(summary.remainingRoi.toString()).toBe("200");
    expect(summary.principalOwed.toString()).toBe("0");
    expect(summary.settlement.eligible).toBe(false);
    await expect(claimPrincipal(userId, inv.id)).rejects.toMatchObject({ code: "PRINCIPAL_SETTLEMENT_DISABLED" });
  });
  it("preserves legacy history, ROI, maturity and claims outside the SINGLE cap", async () => {
    const userId = await member(), old = await legacy(userId);
    await prisma.roiLedger.create({ data: { userId, investmentId: old.id, amount: D(25), cycleNumber: 1 } });
    await single(userId, 200);
    const summary = await getSinglePlanSummary(userId);
    expect(summary.originalCapital.toString()).toBe("200");
    expect(summary.roiAccrued.isZero()).toBe(true);
    const listed = await listInvestments(userId, { page: 1, limit: 100 });
    const history = listed.data.find(i => i.id === old.id);
    expect(history?.planType).toBe("PLAN_90");
    expect(history?.durationDays).toBe(90);
    expect(history?.maturesAt).toEqual(old.maturesAt);
    expect(history?.totalRoiEarned).toBe("25.00000000");
    await prisma.investment.update({ where: { id: old.id }, data: { status: "MATURED", claimablePrincipal: D(100) } });
    await claimPrincipal(userId, old.id);
    expect((await getSinglePlanSummary(userId)).principalReturned.isZero()).toBe(true);
  });
  it("rejects all legacy new-investment options at schema and service boundaries", async () => {
    const userId = await member();
    expect(createInvestmentSchema.safeParse({ amount: 100, planType: "PLAN_360" }).success).toBe(false);
    await expect(createInvestment(userId, { amount: 100, planType: "PLAN_360" })).rejects.toThrow();
    expect(await prisma.investment.count({ where: { userId } })).toBe(0);
  });
  it("rolls back a whole member cycle on invalid financial state and safely retries after correction", async () => {
    const userId = await member(), first = await single(userId), second = await single(userId, 200);
    await prisma.investment.update({ where: { id: first.id }, data: { startedAt: new Date("2026-11-12T00:00:00Z") } });
    await prisma.investment.update({ where: { id: second.id }, data: { dailyROI: D("0.7") } });
    await expect(postSinglePlanMemberCycle(userId, boundary)).rejects.toThrow("configuration is invalid");
    expect(await prisma.singlePlanCycle.count({ where: { userId } })).toBe(0);
    expect(await prisma.roiLedger.count({ where: { userId } })).toBe(0);
    expect((await getSinglePlanSummary(userId)).roiAccrued.isZero()).toBe(true);
    await prisma.investment.update({ where: { id: second.id }, data: { dailyROI: D("0.8") } });
    expect(await postSinglePlanMemberCycle(userId, boundary)).toBe(2);
    expect((await getSinglePlanSummary(userId)).roiAccrued.toString()).toBe("1.2");
  });
  it("database constraints reject cap overrun and ROI double-counting", async () => {
    const userId = await member(); await single(userId);
    await expect(prisma.singlePlanAccount.update({ where: { userId }, data: { roiAccrued: D("200.00000001"), claimableRoi: D("200.00000001") } })).rejects.toThrow();
    await expect(prisma.singlePlanAccount.update({ where: { userId }, data: { roiAccrued: D(1) } })).rejects.toThrow();
    expect((await getSinglePlanSummary(userId)).roiAccrued.isZero()).toBe(true);
  });
  it("wallet movements do not alter original contributed capital", async () => {
    const userId = await member(); await single(userId);
    await prisma.wallet.update({ where: { userId }, data: { incomeWallet: D(30), withdrawalWallet: D(20) } });
    const summary = await getSinglePlanSummary(userId);
    expect(summary.originalCapital.toString()).toBe("100");
    expect(summary.roiAccrued.isZero()).toBe(true);
  });
  it("exposes one authoritative admin plan without changing the legacy catalog", async () => {
    const before = await prisma.systemSettings.findUnique({ where: { key: "plans.catalog" } });
    const plans = await getPlans();
    expect(plans.map(p => p.id)).toEqual(["single"]);
    expect(plans[0]?.roi).toBe(0.8);
    expect(plans[0]?.duration).toBe(0);
    expect(await prisma.systemSettings.findUnique({ where: { key: "plans.catalog" } })).toEqual(before);
  });
  it("rejects conflicting admin rates, cap settings, catalog writes and plan status changes", async () => {
    await expect(updatePlanConfig("single", { roi: 1 }, "unused", "fixture@example.invalid")).rejects.toMatchObject({ code: "INVESTMENT_POLICY_LOCKED" });
    await expect(updatePlanStatus("single", "ACTIVE", "unused", "fixture@example.invalid")).rejects.toMatchObject({ code: "INVESTMENT_POLICY_LOCKED" });
    for (const key of ["roi.default_rate", "roi.max_cap", "plans.catalog"]) {
      await expect(saveConfigField(key, "1", "0", "test", "ROI", "unused", "fixture@example.invalid")).rejects.toMatchObject({ code: "INVESTMENT_POLICY_LOCKED" });
    }
  });
});
