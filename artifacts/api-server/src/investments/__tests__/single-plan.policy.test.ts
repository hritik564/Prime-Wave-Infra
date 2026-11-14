import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { allocateRoi, roiCapacity, settlementEligibility, singlePlanCycleBoundary, singlePlanPolicySchema, SINGLE_PLAN_POLICY } from "../single-plan.policy";

const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);
describe("Single-plan fixed financial policy", () => {
  it("$100 non-working capital permits $200 ROI, including principal only in the $300 total", () => {
    expect(roiCapacity(D(100), D(0), 3).toString()).toBe("200");
    expect(roiCapacity(D(100), D(200), 3).toString()).toBe("0");
  });
  it("$100 working capital permits $400 ROI, not an additive 3x + 5x", () => {
    expect(roiCapacity(D(100), D(0), 5).toString()).toBe("400");
  });
  it("posts a partial final ROI and never a negative balance", () => {
    expect(allocateRoi(D("0.4"), roiCapacity(D(100), D("199.99999999"), 3)).toFixed(8)).toBe("0.00000001");
    expect(roiCapacity(D(100), D(201), 3).toString()).toBe("0");
  });
  it("rounds down at the database precision rather than exceeding the cap", () => {
    expect(allocateRoi(D("0.399999999999"), D(100)).toFixed(8)).toBe("0.39999999");
    expect(allocateRoi(D("0.000000009"), D(100)).toFixed(8)).toBe("0.00000000");
    expect(() => allocateRoi(D(-1), D(1))).toThrow();
  });
  it("fails closed on missing, invalid or unrecognized configuration", () => {
    expect(singlePlanPolicySchema.safeParse({}).success).toBe(false);
    expect(singlePlanPolicySchema.safeParse({ ...SINGLE_PLAN_POLICY, dailyROI: "1.0000" }).success).toBe(false);
    expect(singlePlanPolicySchema.safeParse({ ...SINGLE_PLAN_POLICY, principalSettlementEnabled: true }).success).toBe(false);
    expect(singlePlanPolicySchema.safeParse({ ...SINGLE_PLAN_POLICY, maxCap: 8 }).success).toBe(false);
    expect(() => roiCapacity(D(100), D(0), 8)).toThrow();
  });
  it("principal settlement remains disabled independently of balance and tier", () => {
    expect(settlementEligibility().eligible).toBe(false);
  });
  it.each([
    ["2026-11-14T11:59:59Z", "2026-11-14T00:00:00.000Z"],
    ["2026-11-14T12:00:00Z", "2026-11-14T12:00:00.000Z"],
    ["2026-07-14T11:00:00Z", "2026-07-14T11:00:00.000Z"],
    ["2026-10-25T01:30:00Z", "2026-10-24T23:00:00.000Z"],
    ["2026-03-29T10:59:59Z", "2026-03-29T00:00:00.000Z"],
  ])("uses the actual London boundary including DST: %s", (now, expected) => {
    expect(singlePlanCycleBoundary(new Date(now)).toISOString()).toBe(expected);
  });
});
