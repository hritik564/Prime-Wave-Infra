import { Prisma } from "@prisma/client";
import { z } from "zod";

// Code-owned financial policy: admin catalog/settings cannot override it.
export const singlePlanPolicySchema = z.object({
  planType: z.literal("SINGLE"),
  dailyROI: z.literal("0.8000"),
  nonWorkingTier: z.literal(3),
  workingTier: z.literal(5),
  principalSettlementEnabled: z.literal(false),
  legacyAccounting: z.literal("SEPARATE"),
}).strict();
export const SINGLE_PLAN_POLICY = Object.freeze(singlePlanPolicySchema.parse({
  planType: "SINGLE", dailyROI: "0.8000", nonWorkingTier: 3, workingTier: 5,
  principalSettlementEnabled: false, legacyAccounting: "SEPARATE",
}));
export function roiCapacity(capital: Prisma.Decimal, accrued: Prisma.Decimal, tier: number) {
  if (![3,5].includes(tier) || capital.isNegative() || accrued.isNegative()) throw new Error("Invalid single-plan accounting");
  return Prisma.Decimal.max(capital.mul(tier - 1).minus(accrued), 0);
}
export function allocateRoi(proposed: Prisma.Decimal, remaining: Prisma.Decimal) {
  if (proposed.isNegative() || remaining.isNegative()) throw new Error("Invalid ROI allocation");
  // Always round down to DB precision, including the final partial cycle.
  return Prisma.Decimal.min(proposed, remaining).toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN);
}
export function settlementEligibility() {
  return { eligible: false as const, reason: "Principal settlement policy is awaiting approval" };
}

// Shared scheduled/manual identity: the latest London 00:00 or 12:00 boundary.
// Search absolute hours so BST/GMT changes cannot shift the cycle identity.
export function singlePlanCycleBoundary(now: Date): Date {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 26; i++) {
    const candidate = new Date(hour.getTime() - i * 3_600_000);
    const localHour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23",
    }).format(candidate));
    if (localHour === 0 || localHour === 12) return candidate;
  }
  throw new Error("Cannot determine ROI cycle boundary");
}
