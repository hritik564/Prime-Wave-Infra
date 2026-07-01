import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

// ── Dashboard overview ────────────────────────────────────────────────────────

/**
 * Returns a single aggregated snapshot of the platform state.
 * All counts are fetched in parallel via prisma.$transaction for consistency.
 */
export async function getDashboardStats() {
  const todayStart = startOfToday();

  const [
    totalUsers,
    activeUsers,
    blockedUsers,
    suspendedUsers,
    inactiveUsers,

    totalDeposits,
    pendingDeposits,

    totalWithdrawals,
    pendingWithdrawals,

    totalInvestments,

    roiAgg,
    binaryMatchAgg,
    orbitAgg,
    levelIncomeAgg,
    salaryAgg,

    todayNewUsers,
    todayDepositCount,
    todayWithdrawalCount,
  ] = await prisma.$transaction([
    // User counts by status
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "BLOCKED" } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.user.count({ where: { status: "INACTIVE" } }),

    // Deposits
    prisma.depositRequest.count(),
    prisma.depositRequest.count({ where: { status: "PENDING" } }),

    // Withdrawals
    prisma.withdrawalRequest.count(),
    prisma.withdrawalRequest.count({ where: { status: "PENDING" } }),

    // Investments
    prisma.investment.count(),

    // Income aggregates
    prisma.roiLedger.aggregate({ _sum: { amount: true } }),
    prisma.binaryMatchIncome.aggregate({ _sum: { incomeAmount: true } }),
    prisma.binaryOrbitIncome.aggregate({ _sum: { incomeAmount: true } }),
    prisma.levelIncome.aggregate({ _sum: { incomeAmount: true } }),
    prisma.salaryIncome.aggregate({ _sum: { amount: true } }),

    // Today's activity
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.depositRequest.count({
      where: { status: "APPROVED", approvedAt: { gte: todayStart } },
    }),
    prisma.withdrawalRequest.count({
      where: { status: "COMPLETED", completedAt: { gte: todayStart } },
    }),
  ]);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers,
    blockedUsers,
    suspendedUsers,

    totalDeposits,
    pendingDeposits,

    totalWithdrawals,
    pendingWithdrawals,

    totalInvestments,

    totalRoiPaid:      roiAgg._sum.amount           ?? new Prisma.Decimal(0),
    totalBinaryIncome: binaryMatchAgg._sum.incomeAmount ?? new Prisma.Decimal(0),
    totalOrbitIncome:  orbitAgg._sum.incomeAmount    ?? new Prisma.Decimal(0),
    totalLevelIncome:  levelIncomeAgg._sum.incomeAmount ?? new Prisma.Decimal(0),
    totalSalaryIncome: salaryAgg._sum.amount         ?? new Prisma.Decimal(0),

    todayNewUsers,
    todayDeposits:    todayDepositCount,
    todayWithdrawals: todayWithdrawalCount,
  };
}

// ── System health ─────────────────────────────────────────────────────────────

/**
 * Returns the last known execution timestamp for each cron engine,
 * plus counts of pending operations and failed transactions.
 *
 * "Last execution" is inferred from the most recent DB record produced
 * by each engine — no separate cron-log table required.
 */
export async function getSystemHealth() {
  const [
    lastRoi,
    lastMatching,
    lastOrbit,
    lastSalary,
    failedTxCount,
    pendingDeposits,
    pendingWithdrawals,
  ] = await prisma.$transaction([
    prisma.roiLedger.findFirst({
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    }),
    prisma.binaryMatchIncome.findFirst({
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    }),
    prisma.binaryOrbitIncome.findFirst({
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    }),
    prisma.salaryIncome.findFirst({
      orderBy: { createdAt: "desc" },
      select:  { createdAt: true },
    }),
    prisma.walletTransaction.count({ where: { status: "FAILED" } }),
    prisma.depositRequest.count({ where: { status: "PENDING" } }),
    prisma.withdrawalRequest.count({ where: { status: "PENDING" } }),
  ]);

  return {
    lastRoiCronExecution:        lastRoi?.createdAt            ?? null,
    lastBinaryMatchingExecution: lastMatching?.createdAt       ?? null,
    lastOrbitExecution:          lastOrbit?.createdAt          ?? null,
    lastSalaryExecution:         lastSalary?.createdAt         ?? null,
    lastMonthlySalaryExecution:  lastSalary?.createdAt         ?? null,
    failedJobsCount:             failedTxCount,
    pendingDeposits,
    pendingWithdrawals,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
