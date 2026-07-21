/**
 * Sprint 33J — Salary Report Service
 *
 * Internal service-layer reporting functions.  No HTTP routes.
 * All functions return typed data structures for consumption by
 * admin controllers or export services.
 *
 * Functions:
 *   getSalaryRunSummary(runId)         Full run metrics with rank breakdown.
 *   getMonthlyPayroll(month, year)     Run + all income records for a month.
 *   getMemberSalaryHistory(userId)     All SalaryIncome records for a user.
 *   getRankDistribution(month, year)   Per-rank count and total amounts.
 *   getPayrollTotals(month, year)      Aggregate stats (total, avg, min, max).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Return types ──────────────────────────────────────────────────────────────

export interface SalaryRunSummary {
  runId:        string;
  month:        number;
  year:         number;
  status:       string;
  totalMembers: number;
  generated:    number;
  approved:     number;
  paid:         number;
  pending:      number;
  failed:       number;
  totalPayroll: Prisma.Decimal;
  averageSalary: Prisma.Decimal;
  highestSalary: Prisma.Decimal;
  lowestSalary:  Prisma.Decimal;
  rankBreakdown: Record<string, { count: number; total: Prisma.Decimal }>;
}

export interface PayrollIncomeRow {
  id:        string;
  userId:    string;
  rankName:  string;
  amount:    Prisma.Decimal;
  status:    string;
  createdAt: Date;
}

export interface MonthlyPayroll {
  run:     object | null;
  incomes: PayrollIncomeRow[];
}

export interface SalaryHistoryItem {
  id:           string;
  rankName:     string;
  month:        number;
  year:         number;
  amount:       Prisma.Decimal;
  status:       string;
  approvedAt:   Date | null;
  paidAt:       Date | null;
  transactionId: string | null;
  createdAt:    Date;
}

export interface RankDistributionItem {
  rankName: string;
  count:    number;
  total:    Prisma.Decimal;
}

export interface PayrollTotals {
  month:         number;
  year:          number;
  memberCount:   number;
  totalPayroll:  Prisma.Decimal;
  averageSalary: Prisma.Decimal;
  highestSalary: Prisma.Decimal;
  lowestSalary:  Prisma.Decimal;
  pendingCount:  number;
  approvedCount: number;
  paidCount:     number;
}

// ── getSalaryRunSummary ───────────────────────────────────────────────────────

/**
 * Returns full metrics for a SalaryRun, including aggregate financials and
 * a per-rank breakdown of income records.
 */
export async function getSalaryRunSummary(runId: string): Promise<SalaryRunSummary | null> {
  logger.info({ runId }, "salary-report: generating run summary");

  const run = await prisma.salaryRun.findUnique({
    where: { id: runId },
  });

  if (!run) return null;

  // Aggregate financial stats across all incomes in this run
  const agg = await prisma.salaryIncome.aggregate({
    where:  { salaryRunId: runId },
    _count: { id: true },
    _sum:   { amount: true },
    _avg:   { amount: true },
    _max:   { amount: true },
    _min:   { amount: true },
  });

  // Status breakdown
  const byStatus = await prisma.salaryIncome.groupBy({
    by:    ["status"],
    where: { salaryRunId: runId },
    _count: { status: true },
  });

  const statusMap: Record<string, number> = {};
  for (const row of byStatus) {
    statusMap[row.status] = row._count.status;
  }

  // Rank breakdown
  const byRank = await prisma.salaryIncome.groupBy({
    by:    ["rankName"],
    where: { salaryRunId: runId },
    _count: { rankName: true },
    _sum:   { amount: true },
  });

  const rankBreakdown: Record<string, { count: number; total: Prisma.Decimal }> = {};
  for (const row of byRank) {
    rankBreakdown[row.rankName] = {
      count: row._count.rankName,
      total: row._sum.amount ?? new Prisma.Decimal(0),
    };
  }

  const totalMembers = agg._count.id;
  const summary: SalaryRunSummary = {
    runId:        run.id,
    month:        run.month,
    year:         run.year,
    status:       run.status,
    totalMembers,
    generated:    run.generatedCount,
    approved:     run.approvedCount,
    paid:         run.paidCount,
    pending:      statusMap["PENDING"]  ?? 0,
    failed:       run.failedCount,
    totalPayroll:  agg._sum.amount  ?? new Prisma.Decimal(0),
    averageSalary: totalMembers > 0
      ? (agg._avg.amount ?? new Prisma.Decimal(0))
      : new Prisma.Decimal(0),
    highestSalary: agg._max.amount ?? new Prisma.Decimal(0),
    lowestSalary:  totalMembers > 0
      ? (agg._min.amount ?? new Prisma.Decimal(0))
      : new Prisma.Decimal(0),
    rankBreakdown,
  };

  logger.info({ runId, totalMembers }, "salary-report: run summary generated");
  return summary;
}

// ── getMonthlyPayroll ─────────────────────────────────────────────────────────

/**
 * Returns the SalaryRun (if any) plus all SalaryIncome records for the month.
 */
export async function getMonthlyPayroll(month: number, year: number): Promise<MonthlyPayroll> {
  logger.info({ month, year }, "salary-report: fetching monthly payroll");

  const run = await prisma.salaryRun.findUnique({
    where: { month_year: { month, year } },
  });

  const incomes = await prisma.salaryIncome.findMany({
    where:   { month, year },
    select:  { id: true, userId: true, rankName: true, amount: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return { run, incomes: incomes as PayrollIncomeRow[] };
}

// ── getMemberSalaryHistory ────────────────────────────────────────────────────

/**
 * Returns the full salary history for a member, newest first.
 */
export async function getMemberSalaryHistory(userId: string): Promise<SalaryHistoryItem[]> {
  logger.info({ userId }, "salary-report: fetching member salary history");

  const records = await prisma.salaryIncome.findMany({
    where:   { userId },
    select:  {
      id:            true,
      rankName:      true,
      month:         true,
      year:          true,
      amount:        true,
      status:        true,
      approvedAt:    true,
      paidAt:        true,
      transactionId: true,
      createdAt:     true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  return records as SalaryHistoryItem[];
}

// ── getRankDistribution ───────────────────────────────────────────────────────

/**
 * Returns a per-rank breakdown of SalaryIncome records for a given month,
 * including member count and total payout per rank.
 */
export async function getRankDistribution(
  month: number,
  year:  number,
): Promise<RankDistributionItem[]> {
  logger.info({ month, year }, "salary-report: fetching rank distribution");

  const rows = await prisma.salaryIncome.groupBy({
    by:    ["rankName"],
    where: { month, year },
    _count: { rankName: true },
    _sum:   { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });

  return rows.map((r) => ({
    rankName: r.rankName,
    count:    r._count.rankName,
    total:    r._sum.amount ?? new Prisma.Decimal(0),
  }));
}

// ── getPayrollTotals ──────────────────────────────────────────────────────────

/**
 * Returns aggregate financial totals for a given month.
 */
export async function getPayrollTotals(month: number, year: number): Promise<PayrollTotals> {
  logger.info({ month, year }, "salary-report: computing payroll totals");

  const agg = await prisma.salaryIncome.aggregate({
    where:  { month, year },
    _count: { id: true },
    _sum:   { amount: true },
    _avg:   { amount: true },
    _max:   { amount: true },
    _min:   { amount: true },
  });

  const byStatus = await prisma.salaryIncome.groupBy({
    by:    ["status"],
    where: { month, year },
    _count: { status: true },
  });

  const statusMap: Record<string, number> = {};
  for (const row of byStatus) statusMap[row.status] = row._count.status;

  const memberCount = agg._count.id;

  return {
    month,
    year,
    memberCount,
    totalPayroll:  agg._sum.amount ?? new Prisma.Decimal(0),
    averageSalary: memberCount > 0
      ? (agg._avg.amount ?? new Prisma.Decimal(0))
      : new Prisma.Decimal(0),
    highestSalary: agg._max.amount ?? new Prisma.Decimal(0),
    lowestSalary:  memberCount > 0
      ? (agg._min.amount ?? new Prisma.Decimal(0))
      : new Prisma.Decimal(0),
    pendingCount:  statusMap["PENDING"]  ?? 0,
    approvedCount: statusMap["APPROVED"] ?? 0,
    paidCount:     statusMap["PAID"]     ?? 0,
  };
}
