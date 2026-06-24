import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RankQualification {
  rankName:        string;
  monthlySalary:   Prisma.Decimal;
  durationMonths:  number;
  qualifies:       boolean;
  reason?:         string;
}

// ── Qualification check ───────────────────────────────────────────────────────

/**
 * Evaluates which active ranks a user currently qualifies for.
 *
 * Bronze / Silver / Gold  (allowSpill=false, requiresDualDirects=false)
 *   — Sum SalaryBvLedger entries where investorId is a direct referral
 *     (sponsorId = userId). Single-leg sufficient, no dual-direct gate.
 *
 * Platinum+  (allowSpill=true, requiresDualDirects=true)
 *   — Total BV = user.leftBV + user.rightBV (spill included).
 *   — Leg split: one leg ≥ powerLegRequired, other leg ≥ weakLegRequired.
 *   — Dual directs: ≥1 personally-sponsored member in LEFT, ≥1 in RIGHT.
 */
export async function checkUserQualifications(
  userId: string,
): Promise<RankQualification[]> {
  const [user, ranks] = await prisma.$transaction([
    prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: {
        leftBV:             true,
        rightBV:            true,
        directReferralCount: true,
      },
    }),
    prisma.salaryRankConfig.findMany({
      where:   { isActive: true },
      orderBy: { requiredBusiness: "asc" },
    }),
  ]);

  const results: RankQualification[] = [];

  for (const rank of ranks) {
    const result = await evaluateRank(userId, user, rank);
    results.push(result);
  }

  return results;
}

// ── Per-rank evaluator ────────────────────────────────────────────────────────

async function evaluateRank(
  userId: string,
  user: { leftBV: Prisma.Decimal; rightBV: Prisma.Decimal; directReferralCount: number },
  rank: {
    rankName:            string;
    requiredBusiness:    Prisma.Decimal;
    monthlySalary:       Prisma.Decimal;
    durationMonths:      number;
    requiresDualDirects: boolean;
    allowSpill:          boolean;
    powerLegRequired:    Prisma.Decimal | null;
    weakLegRequired:     Prisma.Decimal | null;
  },
): Promise<RankQualification> {
  const base = {
    rankName:       rank.rankName,
    monthlySalary:  rank.monthlySalary,
    durationMonths: rank.durationMonths,
  };

  // ── Bronze / Silver / Gold — direct business only, single leg OK ───────────
  if (!rank.allowSpill) {
    const agg = await prisma.salaryBvLedger.aggregate({
      where: {
        userId,
        investor: { sponsorId: userId },
      },
      _sum: { bv: true },
    });

    const directBV = agg._sum.bv ?? new Prisma.Decimal(0);

    if (directBV.lt(rank.requiredBusiness)) {
      return {
        ...base,
        qualifies: false,
        reason:    `Direct BV ${directBV.toFixed(2)} < required ${rank.requiredBusiness.toFixed(2)}`,
      };
    }

    return { ...base, qualifies: true };
  }

  // ── Platinum+ — spill counts, dual directs + leg split required ────────────
  const leftBV  = user.leftBV;
  const rightBV = user.rightBV;
  const totalBV = leftBV.plus(rightBV);

  if (totalBV.lt(rank.requiredBusiness)) {
    return {
      ...base,
      qualifies: false,
      reason:    `Total BV ${totalBV.toFixed(2)} < required ${rank.requiredBusiness.toFixed(2)}`,
    };
  }

  // Leg split validation
  if (rank.powerLegRequired && rank.weakLegRequired) {
    const pReq = rank.powerLegRequired;
    const wReq = rank.weakLegRequired;

    const legSplitOk =
      (leftBV.gte(pReq) && rightBV.gte(wReq)) ||
      (leftBV.gte(wReq) && rightBV.gte(pReq));

    if (!legSplitOk) {
      return {
        ...base,
        qualifies: false,
        reason:    `Leg split unmet — LEFT: ${leftBV.toFixed(2)}, RIGHT: ${rightBV.toFixed(2)}. Need ${pReq}/${wReq} split`,
      };
    }
  }

  // Dual directs: ≥1 personally-sponsored member placed LEFT, ≥1 placed RIGHT
  if (rank.requiresDualDirects) {
    const [leftCount, rightCount] = await prisma.$transaction([
      prisma.user.count({
        where: { sponsorId: userId, position: "LEFT" },
      }),
      prisma.user.count({
        where: { sponsorId: userId, position: "RIGHT" },
      }),
    ]);

    if (leftCount < 1 || rightCount < 1) {
      return {
        ...base,
        qualifies: false,
        reason:    `Dual directs unmet — LEFT sponsored: ${leftCount}, RIGHT sponsored: ${rightCount}`,
      };
    }
  }

  return { ...base, qualifies: true };
}
