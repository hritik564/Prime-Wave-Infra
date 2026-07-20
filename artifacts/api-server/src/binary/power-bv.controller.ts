import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../shared/response.js";
import { AppError } from "../middleware/error.middleware.js";
import { HTTP_STATUS } from "../shared/constants.js";
import type { AuthenticatedRequest } from "../shared/types.js";
import { getParsed } from "../middleware/validate.middleware.js";
import {
  addPowerBV,
  removePowerBV,
  getPowerSummary,
  getPowerLedger,
} from "./power-bv.service.js";
import type {
  PowerBvAddInput,
  PowerBvRemoveInput,
  PowerBvLedgerQuery,
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
