/**
 * Sprint 33K — Admin Salary Service
 *
 * Thin service layer that wraps the existing salary services for admin HTTP
 * consumption. No business logic lives here. All rules remain in:
 *   salary-run.service.ts       (lifecycle orchestration)
 *   salary-income.service.ts    (generation)
 *   salary-payout.service.ts    (approval + payout)
 *   salary-report.service.ts    (reporting)
 *   salary-export.service.ts    (CSV export)
 */

import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import {
  createSalaryRun,
  executeGeneration,
  executeApproval,
  executePayout,
  markRunFailed,
  type SalaryRunRow,
} from "./salary-run.service";
import { paySalary } from "./salary-payout.service";
import {
  getSalaryRunSummary,
  getMemberSalaryHistory,
  getPayrollTotals,
  type SalaryRunSummary,
  type SalaryHistoryItem,
  type PayrollTotals,
} from "./salary-report.service";
import {
  exportPayrollSummaryCSV,
  exportPayrollDetailCSV,
  exportMemberHistoryCSV,
  exportRankDistributionCSV,
} from "./salary-export.service";
import type { ListRunsQuery, ListRunIncomesQuery } from "./admin-salary.schema";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";

// ── List salary runs ──────────────────────────────────────────────────────────

export interface SalaryRunListItem {
  id:             string;
  month:          number;
  year:           number;
  status:         string;
  generatedCount: number;
  approvedCount:  number;
  paidCount:      number;
  failedCount:    number;
  totalAmount:    string;
  createdBy:      string | null;
  notes:          string | null;
  startedAt:      string;
  completedAt:    string | null;
  createdAt:      string;
}

export interface SalaryRunListResponse {
  data:  SalaryRunListItem[];
  meta:  { page: number; limit: number; total: number; totalPages: number };
}

export async function listSalaryRuns(q: ListRunsQuery): Promise<SalaryRunListResponse> {
  const where: Record<string, unknown> = {};
  if (q.month  !== undefined) where["month"]  = q.month;
  if (q.year   !== undefined) where["year"]   = q.year;
  if (q.status)               where["status"] = q.status;

  const skip  = (q.page - 1) * q.limit;
  const [total, runs] = await prisma.$transaction([
    prisma.salaryRun.count({ where }),
    prisma.salaryRun.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
      skip,
      take: q.limit,
    }),
  ]);

  const data: SalaryRunListItem[] = runs.map(r => ({
    id:             r.id,
    month:          r.month,
    year:           r.year,
    status:         r.status,
    generatedCount: r.generatedCount,
    approvedCount:  r.approvedCount,
    paidCount:      r.paidCount,
    failedCount:    r.failedCount,
    totalAmount:    r.totalAmount.toFixed(2),
    createdBy:      r.createdBy,
    notes:          r.notes,
    startedAt:      r.startedAt.toISOString(),
    completedAt:    r.completedAt?.toISOString() ?? null,
    createdAt:      r.createdAt.toISOString(),
  }));

  return { data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
}

// ── Get run detail ────────────────────────────────────────────────────────────

export interface SalaryRunDetail {
  run:     SalaryRunListItem;
  summary: SalaryRunSummary | null;
  audits:  SalaryRunAuditItem[];
}

export interface SalaryRunAuditItem {
  id:          string;
  action:      string;
  performedBy: string | null;
  metadata:    unknown;
  createdAt:   string;
}

export async function getSalaryRunDetail(runId: string): Promise<SalaryRunDetail> {
  const run = await prisma.salaryRun.findUnique({
    where:   { id: runId },
    include: { audits: { orderBy: { createdAt: "asc" } } },
  });

  if (!run) throw new AppError("Salary run not found", HTTP_STATUS.NOT_FOUND);

  const summary = await getSalaryRunSummary(runId);

  const runItem: SalaryRunListItem = {
    id:             run.id,
    month:          run.month,
    year:           run.year,
    status:         run.status,
    generatedCount: run.generatedCount,
    approvedCount:  run.approvedCount,
    paidCount:      run.paidCount,
    failedCount:    run.failedCount,
    totalAmount:    run.totalAmount.toFixed(2),
    createdBy:      run.createdBy,
    notes:          run.notes,
    startedAt:      run.startedAt.toISOString(),
    completedAt:    run.completedAt?.toISOString() ?? null,
    createdAt:      run.createdAt.toISOString(),
  };

  const audits: SalaryRunAuditItem[] = run.audits.map(a => ({
    id:          a.id,
    action:      a.action,
    performedBy: a.performedBy,
    metadata:    a.metadata,
    createdAt:   a.createdAt.toISOString(),
  }));

  return { run: runItem, summary, audits };
}

// ── Create run ────────────────────────────────────────────────────────────────

export async function adminCreateSalaryRun(
  month:      number,
  year:       number,
  notes?:     string,
  createdBy?: string,
): Promise<{ status: "created" | "duplicate"; run: SalaryRunRow }> {
  logger.info({ month, year, createdBy }, "admin-salary: createSalaryRun");
  return createSalaryRun(month, year, { createdBy, notes });
}

// ── Trigger generation ────────────────────────────────────────────────────────

export async function adminTriggerGeneration(runId: string, createdBy?: string) {
  logger.info({ runId, createdBy }, "admin-salary: triggerGeneration");
  return executeGeneration(runId, { createdBy });
}

// ── Trigger approval ──────────────────────────────────────────────────────────

export async function adminTriggerApproval(runId: string, createdBy?: string) {
  logger.info({ runId, createdBy }, "admin-salary: triggerApproval");
  return executeApproval(runId, { createdBy });
}

// ── Trigger payout ────────────────────────────────────────────────────────────

export async function adminTriggerPayout(runId: string, createdBy?: string) {
  logger.info({ runId, createdBy }, "admin-salary: triggerPayout");
  return executePayout(runId, { createdBy });
}

// ── Mark run failed ───────────────────────────────────────────────────────────

export async function adminMarkRunFailed(
  runId:      string,
  reason?:    string,
  performedBy?: string,
): Promise<void> {
  logger.warn({ runId, reason, performedBy }, "admin-salary: markRunFailed");
  return markRunFailed(runId, reason, performedBy);
}

// ── List incomes for a run ────────────────────────────────────────────────────

export interface RunIncomeItem {
  id:            string;
  userId:        string;
  username:      string | null;
  rankName:      string;
  amount:        string;
  status:        string;
  approvedAt:    string | null;
  paidAt:        string | null;
  transactionId: string | null;
  createdAt:     string;
}

export interface RunIncomeListResponse {
  data: RunIncomeItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function listRunIncomes(
  runId: string,
  q:     ListRunIncomesQuery,
): Promise<RunIncomeListResponse> {
  const run = await prisma.salaryRun.findUnique({ where: { id: runId }, select: { id: true } });
  if (!run) throw new AppError("Salary run not found", HTTP_STATUS.NOT_FOUND);

  const where: Record<string, unknown> = { salaryRunId: runId };
  if (q.status) where["status"]   = q.status;
  if (q.rank)   where["rankName"] = q.rank;
  if (q.search) {
    where["user"] = {
      OR: [
        { username: { contains: q.search, mode: "insensitive" } },
        { id:       { contains: q.search, mode: "insensitive" } },
      ],
    };
  }

  const skip = (q.page - 1) * q.limit;
  const [total, incomes] = await prisma.$transaction([
    prisma.salaryIncome.count({ where }),
    prisma.salaryIncome.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: q.limit,
      include: { user: { select: { username: true } } },
    }),
  ]);

  const data: RunIncomeItem[] = incomes.map(i => ({
    id:            i.id,
    userId:        i.userId,
    username:      i.user?.username ?? null,
    rankName:      i.rankName,
    amount:        i.amount.toFixed(2),
    status:        i.status,
    approvedAt:    i.approvedAt?.toISOString() ?? null,
    paidAt:        i.paidAt?.toISOString()     ?? null,
    transactionId: i.transactionId             ?? null,
    createdAt:     i.createdAt.toISOString(),
  }));

  return { data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
}

// ── Retry single income payout ────────────────────────────────────────────────

export async function adminRetryIncome(incomeId: string) {
  logger.info({ incomeId }, "admin-salary: retrying income payout");
  const income = await prisma.salaryIncome.findUnique({ where: { id: incomeId }, select: { id: true, status: true } });
  if (!income) throw new AppError("Salary income not found", HTTP_STATUS.NOT_FOUND);
  if (income.status === "PAID") throw new AppError("Income is already paid", HTTP_STATUS.CONFLICT);
  return paySalary(incomeId);
}

// ── Member salary history ─────────────────────────────────────────────────────

export async function adminGetMemberHistory(userId: string): Promise<SalaryHistoryItem[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  return getMemberSalaryHistory(userId);
}

export async function adminSearchMemberHistory(search: string, page: number, limit: number) {
  const where = {
    OR: [
      { username: { contains: search, mode: "insensitive" as const } },
      { id:       { contains: search, mode: "insensitive" as const } },
    ],
  };
  const users = await prisma.user.findMany({
    where,
    select: { id: true, username: true },
    take: limit,
    skip: (page - 1) * limit,
  });
  return users;
}

// ── Payroll totals ────────────────────────────────────────────────────────────

export async function adminGetPayrollTotals(month: number, year: number): Promise<PayrollTotals> {
  return getPayrollTotals(month, year);
}

// ── CSV exports ───────────────────────────────────────────────────────────────

export async function adminExportSummaryCSV(month: number, year: number): Promise<string> {
  return exportPayrollSummaryCSV(month, year);
}

export async function adminExportDetailCSV(month: number, year: number): Promise<string> {
  return exportPayrollDetailCSV(month, year);
}

export async function adminExportMemberHistoryCSV(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
  return exportMemberHistoryCSV(userId);
}

export async function adminExportRankDistributionCSV(month: number, year: number): Promise<string> {
  return exportRankDistributionCSV(month, year);
}
