import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../shared/response.js";
import { AppError } from "../middleware/error.middleware.js";
import { HTTP_STATUS } from "../shared/constants.js";
import type { AuthenticatedRequest } from "../shared/types.js";
import { getParsed } from "../middleware/validate.middleware.js";
import { Prisma } from "@prisma/client";
import {
  addPowerBV,
  removePowerBV,
  getPowerSummary,
  getPowerLedger,
  getGlobalPowerStats,
  getGlobalPowerLedger,
  getGlobalPowerAnalytics,
  searchPowerMembers,
} from "./power-bv.service.js";
import type {
  PowerBvAddInput,
  PowerBvRemoveInput,
  PowerBvLedgerQuery,
  GlobalPowerLedgerQuery,
  PowerBvSearchQuery,
} from "./power-bv.schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminId(req: Request): string {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.sub) {
    throw new AppError("Admin identity missing from token", HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED");
  }
  return user.sub;
}

function userId(res: Response): string {
  const p = getParsed<{ userId: string }>(res, "params");
  return p.userId;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function addPowerBVHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await addPowerBV(adminId(req), userId(res), req.body as PowerBvAddInput);
    sendCreated(res, { userId: userId(res) }, "Power BV added successfully");
  } catch (err) { next(err); }
}

export async function removePowerBVHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    await removePowerBV(adminId(req), userId(res), req.body as PowerBvRemoveInput);
    sendSuccess(res, { userId: userId(res) }, "Power BV removed successfully");
  } catch (err) { next(err); }
}

export async function getPowerSummaryHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await getPowerSummary(userId(res));
    sendSuccess(res, data, "Power BV summary fetched");
  } catch (err) { next(err); }
}

export async function getPowerLedgerHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query = getParsed<PowerBvLedgerQuery>(res, "query");
    const data  = await getPowerLedger(userId(res), query);
    sendSuccess(res, data, "Power BV ledger fetched");
  } catch (err) { next(err); }
}

// ── Global handlers (Sprint 35) ───────────────────────────────────────────────

export async function getGlobalStatsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await getGlobalPowerStats();
    sendSuccess(res, data, "Global power stats fetched");
  } catch (err) { next(err); }
}

export async function getGlobalLedgerHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query = getParsed<GlobalPowerLedgerQuery>(res, "query");
    const data  = await getGlobalPowerLedger(query);
    sendSuccess(res, data, "Global power ledger fetched");
  } catch (err) { next(err); }
}

export async function getGlobalLedgerCsvHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query = getParsed<GlobalPowerLedgerQuery>(res, "query");
    const data  = await getGlobalPowerLedger({ ...query, limit: 5000, page: 1 });

    const header = "Timestamp,Member Email,Username,Admin Email,Side,BV,Business ($),Action,Reason,Balance Before,Balance After\n";
    const rows   = data.records.map(r => [
      new Date(r.createdAt).toISOString(),
      `"${r.user.email}"`,
      `"${r.user.username}"`,
      `"${r.admin.email}"`,
      r.side,
      String(r.bv),
      new Prisma.Decimal(String(r.bv)).times(100).toFixed(2),
      r.operation,
      `"${String(r.reason).replace(/"/g, '""')}"`,
      String(r.balanceBefore),
      String(r.balanceAfter),
    ].join(",")).join("\n");

    res.setHeader("Content-Type",        "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="power-bv-ledger-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (err) { next(err); }
}

export async function getGlobalAnalyticsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await getGlobalPowerAnalytics();
    sendSuccess(res, data, "Global power analytics fetched");
  } catch (err) { next(err); }
}

export async function searchMembersHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query = getParsed<PowerBvSearchQuery>(res, "query");
    const data  = await searchPowerMembers(query);
    sendSuccess(res, data, "Power members search results");
  } catch (err) { next(err); }
}
