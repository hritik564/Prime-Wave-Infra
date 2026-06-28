import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type {
  SalaryHistoryQuery,
  SalaryAchievementsQuery,
} from "./salary.schema";

// ── History ───────────────────────────────────────────────────────────────────

const historySelect = {
  id:        true,
  rankName:  true,
  month:     true,
  year:      true,
  amount:    true,
  createdAt: true,
} as const;

export async function getSalaryHistory(
  userId: string,
  query: SalaryHistoryQuery,
) {
  await assertUserExists(userId);

  const { page, limit, rankName, year, month } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.SalaryIncomeWhereInput = {
    userId,
    ...(rankName && { rankName }),
    ...(year     && { year }),
    ...(month    && { month }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.salaryIncome.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
      skip,
      take:    limit,
      select:  historySelect,
    }),
    prisma.salaryIncome.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getSalarySummary(userId: string) {
  await assertUserExists(userId);

  // Active achievements → active salary stacks
  const activeAchievements = await prisma.salaryAchievement.findMany({
    where:  { userId, isActive: true },
    select: { rankName: true, monthlyAmount: true, expiresAt: true },
    orderBy: { monthlyAmount: "asc" },
  });

  const activeMonthlySalary = activeAchievements.reduce(
    (sum, a) => sum.plus(a.monthlyAmount),
    new Prisma.Decimal(0),
  );

  // Lifetime income
  const lifetimeAgg = await prisma.salaryIncome.aggregate({
    where: { userId },
    _sum:  { amount: true },
  });

  const lifetimeSalaryIncome = lifetimeAgg._sum.amount ?? new Prisma.Decimal(0);

  return {
    activeMonthlySalary,
    lifetimeSalaryIncome,
    activeRanks: activeAchievements.map((a) => a.rankName),
    activeAchievements: activeAchievements.map((a) => ({
      rankName:      a.rankName,
      monthlyAmount: a.monthlyAmount,
      expiresAt:     a.expiresAt,
    })),
  };
}

// ── Achievements ──────────────────────────────────────────────────────────────

const achievementSelect = {
  id:            true,
  rankName:      true,
  achievedAt:    true,
  expiresAt:     true,
  monthlyAmount: true,
  isActive:      true,
  createdAt:     true,
} as const;

export async function getSalaryAchievements(
  userId: string,
  query: SalaryAchievementsQuery,
) {
  await assertUserExists(userId);

  const where: Prisma.SalaryAchievementWhereInput = {
    userId,
    ...(query.isActive !== undefined && { isActive: query.isActive }),
  };

  const achievements = await prisma.salaryAchievement.findMany({
    where,
    orderBy: { achievedAt: "desc" },
    select:  achievementSelect,
  });

  return achievements;
}

// ── Qualification Summary (dashboard) ─────────────────────────────────────────

/**
 * Returns a compact salary qualification snapshot for the logged-in user's
 * dashboard. Reads leftBV / rightBV directly (same source as the qualification
 * engine) and computes:
 *   – totalBusinessUSD, per-leg USD
 *   – per-rank qualification list (BV threshold + leg-split check)
 *   – highestRank / nextRank names
 *   – progressPct and remaining USD to next milestone
 *
 * Does NOT call checkUserQualifications (to avoid the extra isMemberActive
 * round-trip): the dashboard always shows BV progress regardless of whether the
 * user is currently a Global Active Member.
 */
export async function getSalaryQualificationSummary(userId: string) {
  await assertUserExists(userId);

  const BV_TO_USD = new Prisma.Decimal("100");

  const [user, ranks] = await prisma.$transaction([
    prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { leftBV: true, rightBV: true },
    }),
    prisma.salaryRankConfig.findMany({
      where:   { isActive: true },
      orderBy: { requiredBusiness: "asc" },
      select:  {
        rankName:          true,
        requiredBusiness:  true,
        monthlySalary:     true,
        powerLegRequired:  true,
        weakLegRequired:   true,
      },
    }),
  ]);

  const leftBusinessUSD  = user.leftBV.times(BV_TO_USD);
  const rightBusinessUSD = user.rightBV.times(BV_TO_USD);
  const totalBusinessUSD = leftBusinessUSD.plus(rightBusinessUSD);

  const qualifications = ranks.map((rank) => {
    if (totalBusinessUSD.lt(rank.requiredBusiness)) {
      return {
        rankName:         rank.rankName,
        requiredBusiness: rank.requiredBusiness,
        monthlySalary:    rank.monthlySalary,
        qualifies:        false,
      };
    }
    if (rank.powerLegRequired !== null && rank.weakLegRequired !== null) {
      const pReq   = rank.powerLegRequired;
      const wReq   = rank.weakLegRequired;
      const legOk  =
        (leftBusinessUSD.gte(pReq)  && rightBusinessUSD.gte(wReq)) ||
        (rightBusinessUSD.gte(pReq) && leftBusinessUSD.gte(wReq));
      if (!legOk) {
        return {
          rankName:         rank.rankName,
          requiredBusiness: rank.requiredBusiness,
          monthlySalary:    rank.monthlySalary,
          qualifies:        false,
        };
      }
    }
    return {
      rankName:         rank.rankName,
      requiredBusiness: rank.requiredBusiness,
      monthlySalary:    rank.monthlySalary,
      qualifies:        true,
    };
  });

  const qualifyingCount = qualifications.filter((q) => q.qualifies).length;
  const highestRankEntry = qualifications[qualifyingCount - 1] ?? null;
  const nextRankEntry    = ranks[qualifyingCount] ?? null;

  const currentThreshold = highestRankEntry?.requiredBusiness ?? new Prisma.Decimal(0);
  const nextThreshold    = nextRankEntry?.requiredBusiness    ?? null;

  let progressPct = 0;
  let remaining   = new Prisma.Decimal(0);

  if (nextThreshold !== null) {
    const span  = nextThreshold.minus(currentThreshold);
    const done  = totalBusinessUSD.minus(currentThreshold);
    progressPct = span.gt(0)
      ? Math.min(100, Math.max(0, Math.round(done.div(span).times(100).toNumber())))
      : 100;
    remaining = Prisma.Decimal.max(new Prisma.Decimal(0), nextThreshold.minus(totalBusinessUSD));
  } else {
    progressPct = 100; // all milestones unlocked
  }

  return {
    totalBusinessUSD,
    leftBusinessUSD,
    rightBusinessUSD,
    qualifications,
    highestRank:          highestRankEntry?.rankName ?? null,
    nextRank:             nextRankEntry?.rankName    ?? null,
    nextRequiredBusiness: nextThreshold,
    remaining,
    progressPct,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertUserExists(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true },
  });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
}
