import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type {
  ListRunsQuery,
  ListRunIncomesQuery,
  CreateRunBody,
  FailRunBody,
  ExportQuery,
  ExportMemberQuery,
} from "./admin-salary.schema";
import {
  listSalaryRuns,
  getSalaryRunDetail,
  adminCreateSalaryRun,
  adminTriggerGeneration,
  adminTriggerApproval,
  adminTriggerPayout,
  adminMarkRunFailed,
  listRunIncomes,
  adminRetryIncome,
  adminGetMemberHistory,
  adminSearchMemberHistory,
  adminGetPayrollTotals,
  adminExportSummaryCSV,
  adminExportDetailCSV,
  adminExportMemberHistoryCSV,
  adminExportRankDistributionCSV,
} from "./admin-salary.service";

// ── List runs ─────────────────────────────────────────────────────────────────

export async function listSalaryRunsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<ListRunsQuery>(res, "query");
    const result = await listSalaryRuns(q);
    sendSuccess(res, result, "Salary runs fetched");
  } catch (err) { next(err); }
}

// ── Get run detail ────────────────────────────────────────────────────────────

export async function getSalaryRunDetailHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const runId = String(req.params["runId"] ?? "");
    const result = await getSalaryRunDetail(runId);
    sendSuccess(res, result, "Salary run detail fetched");
  } catch (err) { next(err); }
}

// ── Create run ────────────────────────────────────────────────────────────────

export async function createSalaryRunHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateRunBody;
    const adminReq = req as AuthenticatedRequest;
    const createdBy = adminReq.user?.sub ?? undefined;
    const result = await adminCreateSalaryRun(body.month, body.year, body.notes, createdBy);
    if (result.status === "duplicate") {
      sendSuccess(res, { status: "duplicate", run: result.run }, "Salary run already exists for this month/year");
    } else {
      sendCreated(res, { status: "created", run: result.run }, "Salary run created");
    }
  } catch (err) { next(err); }
}

// ── Trigger generation ────────────────────────────────────────────────────────

export async function triggerGenerationHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const runId = String(req.params["runId"] ?? "");
    const adminReq = req as AuthenticatedRequest;
    const createdBy = adminReq.user?.sub ?? undefined;
    const result = await adminTriggerGeneration(runId, createdBy);
    sendSuccess(res, result, "Generation triggered");
  } catch (err) { next(err); }
}

// ── Trigger approval ──────────────────────────────────────────────────────────

export async function triggerApprovalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const runId = String(req.params["runId"] ?? "");
    const adminReq = req as AuthenticatedRequest;
    const createdBy = adminReq.user?.sub ?? undefined;
    const result = await adminTriggerApproval(runId, createdBy);
    sendSuccess(res, result, "Approval triggered");
  } catch (err) { next(err); }
}

// ── Trigger payout ────────────────────────────────────────────────────────────

export async function triggerPayoutHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const runId = String(req.params["runId"] ?? "");
    const adminReq = req as AuthenticatedRequest;
    const createdBy = adminReq.user?.sub ?? undefined;
    const result = await adminTriggerPayout(runId, createdBy);
    sendSuccess(res, result, "Payout triggered");
  } catch (err) { next(err); }
}

// ── Fail run ──────────────────────────────────────────────────────────────────

export async function failRunHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const runId = String(req.params["runId"] ?? "");
    const body  = req.body as FailRunBody;
    const adminReq  = req as AuthenticatedRequest;
    const performedBy = adminReq.user?.sub ?? undefined;
    await adminMarkRunFailed(runId, body.reason, performedBy);
    sendSuccess(res, { runId }, "Run marked as failed");
  } catch (err) { next(err); }
}

// ── List run incomes ──────────────────────────────────────────────────────────

export async function listRunIncomesHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const runId = String(req.params["runId"] ?? "");
    const q     = getParsed<ListRunIncomesQuery>(res, "query");
    const result = await listRunIncomes(runId, q);
    sendSuccess(res, result, "Run incomes fetched");
  } catch (err) { next(err); }
}

// ── Retry income ──────────────────────────────────────────────────────────────

export async function retryIncomeHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const incomeId = String(req.params["incomeId"] ?? "");
    const result   = await adminRetryIncome(incomeId);
    sendSuccess(res, result, "Income payout retried");
  } catch (err) { next(err); }
}

// ── Member salary history ─────────────────────────────────────────────────────

export async function getMemberHistoryHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = String(req.params["userId"] ?? "");
    const result = await adminGetMemberHistory(userId);
    sendSuccess(res, { data: result }, "Member salary history fetched");
  } catch (err) { next(err); }
}

// ── Member search ─────────────────────────────────────────────────────────────

export async function searchMembersHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const search = String(req.query["search"] ?? "");
    const page   = Number(req.query["page"]   ?? 1);
    const limit  = Number(req.query["limit"]  ?? 20);
    const result = await adminSearchMemberHistory(search, page, limit);
    sendSuccess(res, { data: result }, "Members fetched");
  } catch (err) { next(err); }
}

// ── Payroll totals ────────────────────────────────────────────────────────────

export async function getPayrollTotalsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<ExportQuery>(res, "query");
    const result = await adminGetPayrollTotals(q.month, q.year);
    sendSuccess(res, result, "Payroll totals fetched");
  } catch (err) { next(err); }
}

// ── CSV exports ───────────────────────────────────────────────────────────────

function sendCsv(res: Response, csv: string, filename: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function exportSummaryHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q   = getParsed<ExportQuery>(res, "query");
    const csv = await adminExportSummaryCSV(q.month, q.year);
    sendCsv(res, csv, `payroll-summary-${q.year}-${String(q.month).padStart(2,"0")}.csv`);
  } catch (err) { next(err); }
}

export async function exportDetailHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q   = getParsed<ExportQuery>(res, "query");
    const csv = await adminExportDetailCSV(q.month, q.year);
    sendCsv(res, csv, `payroll-detail-${q.year}-${String(q.month).padStart(2,"0")}.csv`);
  } catch (err) { next(err); }
}

export async function exportMemberHistoryHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q   = getParsed<ExportMemberQuery>(res, "query");
    const csv = await adminExportMemberHistoryCSV(q.userId);
    sendCsv(res, csv, `member-history-${q.userId}.csv`);
  } catch (err) { next(err); }
}

export async function exportRankDistributionHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q   = getParsed<ExportQuery>(res, "query");
    const csv = await adminExportRankDistributionCSV(q.month, q.year);
    sendCsv(res, csv, `rank-distribution-${q.year}-${String(q.month).padStart(2,"0")}.csv`);
  } catch (err) { next(err); }
}
