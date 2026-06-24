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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertUserExists(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true },
  });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
}
