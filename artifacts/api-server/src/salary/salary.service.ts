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
  id:            true,
  rankName:      true,
  month:         true,
  year:          true,
  amount:        true,
  status:        true,
  reference:     true,
  approvedAt:    true,
  approvedBy:    true,
  paidAt:        true,
  transactionId: true,
  createdAt:     true,
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
 * dashboard. Computes business volume from actual ACTIVE investment amounts
 * in each binary leg (recursive CTE) rather than from leftBV / rightBV.
 *
 * Rationale: the binary matching engine resets leftBV / rightBV to 0 after
 * each cycle flush. Investments are permanent and are the ground truth for
 * how much business the user has built in total.
 */
export async function getSalaryQualificationSummary(userId: string) {
  await assertUserExists(userId);

  const ranks = await prisma.salaryRankConfig.findMany({
    where:   { isActive: true },
    orderBy: { requiredBusiness: "asc" },
    select:  {
      rankName:          true,
      requiredBusiness:  true,
      monthlySalary:     true,
      powerLegRequired:  true,
      weakLegRequired:   true,
    },
  });

  // Walk the binary tree from the user's perspective using a recursive CTE.
  // For each leg we sum the ACTIVE investment amounts of every descendant in
  // that subtree.  This is equivalent to the BV the salary engine would see
  // at cycle time (before the binary flush resets leftBV / rightBV to 0).
  type LegRow = { left_business: string | number; right_business: string | number };
  const legRows = await prisma.$queryRaw<LegRow[]>`
    WITH RECURSIVE
      left_tree AS (
        SELECT id FROM users
        WHERE  "binaryParentId" = ${userId}
          AND  position::text = 'LEFT'
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN left_tree lt ON u."binaryParentId" = lt.id
      ),
      right_tree AS (
        SELECT id FROM users
        WHERE  "binaryParentId" = ${userId}
          AND  position::text = 'RIGHT'
        UNION ALL
        SELECT u.id FROM users u
        INNER JOIN right_tree rt ON u."binaryParentId" = rt.id
      )
    SELECT
      COALESCE(
        SUM(i.amount) FILTER (WHERE i."userId" IN (SELECT id FROM left_tree)),
        0
      ) AS left_business,
      COALESCE(
        SUM(i.amount) FILTER (WHERE i."userId" IN (SELECT id FROM right_tree)),
        0
      ) AS right_business
    FROM investments i
    WHERE i.status = 'ACTIVE'
  `;

  const row = legRows[0] ?? { left_business: 0, right_business: 0 };
  const leftBusinessUSD  = new Prisma.Decimal(row.left_business.toString());
  const rightBusinessUSD = new Prisma.Decimal(row.right_business.toString());
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

  // ── SalaryBusinessSummary data (for member breakdown display) ──────────────
  const summaryRow = await prisma.salaryBusinessSummary.findUnique({
    where:  { userId },
    select: { directBusiness: true, downlineBusiness: true, powerBusiness: true },
  });
  const directBusiness   = summaryRow?.directBusiness   ?? new Prisma.Decimal(0);
  const downlineBusiness = summaryRow?.downlineBusiness ?? new Prisma.Decimal(0);
  const powerBusiness    = summaryRow?.powerBusiness    ?? new Prisma.Decimal(0);

  // Gold unlock: once a Gold achievement is active, ALL_BUSINESS pools unlock
  const goldAchievement = await prisma.salaryAchievement.findFirst({
    where:  { userId, rankName: "Gold", isActive: true },
    select: { id: true },
  });
  const isGoldUnlocked = goldAchievement !== null;

  const effectiveBusiness = isGoldUnlocked
    ? directBusiness.plus(downlineBusiness).plus(powerBusiness)
    : directBusiness;

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
    directBusiness,
    downlineBusiness,
    powerBusiness,
    effectiveBusiness,
    isGoldUnlocked,
  };
}

// ── Upcoming Run (member-facing) ──────────────────────────────────────────────

/**
 * Returns the most recent non-terminal salary run (if one exists) along with
 * the requesting user's income record for that run.  Returns null when no
 * active run is in progress.
 */
export async function getUpcomingRun(userId: string) {
  await assertUserExists(userId);

  const run = await prisma.salaryRun.findFirst({
    where:   { status: { notIn: ["COMPLETED", "FAILED"] } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    select: {
      id:             true,
      month:          true,
      year:           true,
      status:         true,
      startedAt:      true,
      generatedCount: true,
      totalAmount:    true,
    },
  });

  if (!run) return null;

  const income = await prisma.salaryIncome.findFirst({
    where:  { salaryRunId: run.id, userId },
    select: { amount: true, status: true, rankName: true, paidAt: true },
  });

  return {
    runId:           run.id,
    month:           run.month,
    year:            run.year,
    status:          run.status,
    startedAt:       run.startedAt,
    generatedCount:  run.generatedCount,
    estimatedAmount: income?.amount   ?? null,
    incomeStatus:    income?.status   ?? null,
    rankName:        income?.rankName ?? null,
    paidAt:          income?.paidAt   ?? null,
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
