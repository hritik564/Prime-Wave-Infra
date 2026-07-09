import { type Request, type Response, type NextFunction } from "express";
import { sendSuccess } from "../../shared/response";
import { getParsed } from "../../middleware/validate.middleware";
import { prisma } from "../../config/prisma";
import type { AuthenticatedRequest } from "../../shared/types";
import { Prisma } from "@prisma/client";
import {
  getMemberReport,
  getMemberReportSummary,
  getAllMembersForExport,
} from "./member-reports.service";
import { buildMemberCsv } from "./member-reports-csv";
import { buildMemberExcel } from "./member-reports-excel";
import type { MemberReportQuery, MemberExportQuery } from "./member-reports.schema";

// ── GET /admin/reports/members ────────────────────────────────────────────────

export async function memberReportHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<MemberReportQuery>(res, "query");
    const [report, summary] = await Promise.all([
      getMemberReport(q),
      getMemberReportSummary(),
    ]);
    sendSuccess(res, { ...report, summary }, "Member report retrieved");
  } catch (err) { next(err); }
}

// ── GET /admin/reports/members/export ─────────────────────────────────────────

export async function memberExportExcelHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = authReq.user.sub;
    const q       = getParsed<MemberExportQuery>(res, "query");
    const rows    = await getAllMembersForExport(q);
    const buffer  = await buildMemberExcel(rows, q);

    await prisma.adminLog.create({
      data: {
        adminId,
        action:  "REPORT_EXPORT",
        details: { reportType: "MEMBER_REPORT_EXCEL", filters: q as unknown as Prisma.InputJsonValue, rowsExported: rows.length },
      },
    });

    const filename = `members-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(buffer);
  } catch (err) { next(err); }
}

// ── GET /admin/reports/members/export-csv ─────────────────────────────────────

export async function memberExportCsvHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const adminId = authReq.user.sub;
    const q       = getParsed<MemberExportQuery>(res, "query");
    const rows    = await getAllMembersForExport(q);
    const csv     = buildMemberCsv(rows);

    await prisma.adminLog.create({
      data: {
        adminId,
        action:  "REPORT_EXPORT",
        details: { reportType: "MEMBER_REPORT_CSV", filters: q as unknown as Prisma.InputJsonValue, rowsExported: rows.length },
      },
    });

    const filename = `members-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(csv);
  } catch (err) { next(err); }
}
