import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { isMemberActive } from "../eligibility/eligibility.service";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * 1 BV unit = $100 USD.
 * leftBV / rightBV on User are stored in BV units; multiply by this factor
 * to obtain the actual qualifying business in dollars.
 */
const BV_TO_USD = new Prisma.Decimal("100");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RankQualification {
  rankName:           string;
  monthlySalary:      Prisma.Decimal;
  durationMonths:     number;
  qualifies:          boolean;
  reason?:            string;
  totalBusinessUSD?:  Prisma.Decimal;
  leftBusinessUSD?:   Prisma.Decimal;
  rightBusinessUSD?:  Prisma.Decimal;
}

// ── Highest qualifying rank ───────────────────────────────────────────────────

/**
 * Returns the SINGLE highest salary rank that a user currently qualifies for,
 * or null if they qualify for none.
 *
 * Qualification rules (Sprint 23E):
 *   1. Global Active Member:
 *        directLeftCount ≥ 1 AND directRightCount ≥ 1
 *        AND at least one ACTIVE investment ≥ $100
 *   2. Total business ≥ requiredBusiness (in USD)
 *        totalBusinessUSD = (leftBV + rightBV) × $100
 *   3. Bronze / Silver / Gold (powerLegRequired IS NULL):
 *        Single-leg — no leg split required; business from either leg counts.
 *   4. Platinum and above (powerLegRequired IS NOT NULL):
 *        40% / 60% leg split — one leg ≥ powerLegRequired, other ≥ weakLegRequired.
 *
 * Ranks are evaluated highest-first; the first match is returned.
 */
export async function getHighestQualifyingRank(
  userId: string,
): Promise<RankQualification | null> {
  const active = await isMemberActive(userId);
  if (!active) return null;

  const [user, ranks] = await prisma.$transaction([
    prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { leftBV: true, rightBV: true },
    }),
    prisma.salaryRankConfig.findMany({
      where:   { isActive: true },
      orderBy: { requiredBusiness: "desc" },
    }),
  ]);

  const leftUSD  = user.leftBV.times(BV_TO_USD);
  const rightUSD = user.rightBV.times(BV_TO_USD);
  const totalUSD = leftUSD.plus(rightUSD);

  for (const rank of ranks) {
    if (totalUSD.lt(rank.requiredBusiness)) continue;

    if (rank.powerLegRequired !== null && rank.weakLegRequired !== null) {
      const pReq = rank.powerLegRequired;
      const wReq = rank.weakLegRequired;
      const legSplitOk =
        (leftUSD.gte(pReq) && rightUSD.gte(wReq)) ||
        (rightUSD.gte(pReq) && leftUSD.gte(wReq));
      if (!legSplitOk) continue;
    }

    return {
      rankName:          rank.rankName,
      monthlySalary:     rank.monthlySalary,
      durationMonths:    rank.durationMonths,
      qualifies:         true,
      totalBusinessUSD:  totalUSD,
      leftBusinessUSD:   leftUSD,
      rightBusinessUSD:  rightUSD,
    };
  }

  return null;
}

// ── Full evaluation report (all ranks) ───────────────────────────────────────

/**
 * Returns a qualification report for every active rank.
 * Used by admin reporting and the salary qualification API endpoint.
 *
 * Does NOT determine which rank is awarded (use getHighestQualifyingRank for that).
 */
export async function checkUserQualifications(
  userId: string,
): Promise<RankQualification[]> {
  const active = await isMemberActive(userId);

  const [user, ranks] = await prisma.$transaction([
    prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { leftBV: true, rightBV: true },
    }),
    prisma.salaryRankConfig.findMany({
      where:   { isActive: true },
      orderBy: { requiredBusiness: "asc" },
    }),
  ]);

  if (!active) {
    return ranks.map((r) => ({
      rankName:       r.rankName,
      monthlySalary:  r.monthlySalary,
      durationMonths: r.durationMonths,
      qualifies:      false,
      reason:
        "Not a Global Active Member (requires: directLeft ≥ 1, directRight ≥ 1, ACTIVE investment ≥ $100)",
    }));
  }

  const leftUSD  = user.leftBV.times(BV_TO_USD);
  const rightUSD = user.rightBV.times(BV_TO_USD);
  const totalUSD = leftUSD.plus(rightUSD);

  return ranks.map((rank): RankQualification => {
    if (totalUSD.lt(rank.requiredBusiness)) {
      return {
        rankName:       rank.rankName,
        monthlySalary:  rank.monthlySalary,
        durationMonths: rank.durationMonths,
        qualifies:      false,
        reason: `Total business $${totalUSD.toFixed(2)} < required $${rank.requiredBusiness.toFixed(2)}`,
      };
    }

    if (rank.powerLegRequired !== null && rank.weakLegRequired !== null) {
      const pReq = rank.powerLegRequired;
      const wReq = rank.weakLegRequired;
      const legSplitOk =
        (leftUSD.gte(pReq) && rightUSD.gte(wReq)) ||
        (rightUSD.gte(pReq) && leftUSD.gte(wReq));

      if (!legSplitOk) {
        return {
          rankName:       rank.rankName,
          monthlySalary:  rank.monthlySalary,
          durationMonths: rank.durationMonths,
          qualifies:      false,
          reason: `Leg split unmet — LEFT: $${leftUSD.toFixed(2)}, RIGHT: $${rightUSD.toFixed(2)}. Need $${pReq.toFixed(2)} / $${wReq.toFixed(2)} split (40%/60%)`,
        };
      }
    }

    return {
      rankName:          rank.rankName,
      monthlySalary:     rank.monthlySalary,
      durationMonths:    rank.durationMonths,
      qualifies:         true,
      totalBusinessUSD:  totalUSD,
      leftBusinessUSD:   leftUSD,
      rightBusinessUSD:  rightUSD,
    };
  });
}
