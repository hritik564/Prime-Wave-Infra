import type { Request, Response, NextFunction } from "express";
import { loginAdmin, getAdminProfile } from "./admin.service";
import { runMatchingCycle } from "../binary/matching.engine";
import { sendSuccess } from "../shared/response";
import type { AdminLoginInput } from "./admin.schema";
import type { AuthenticatedRequest } from "../shared/types";

export async function adminLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await loginAdmin(req.body as AdminLoginInput);
    sendSuccess(res, result, "Admin login successful");
  } catch (err) {
    next(err);
  }
}

export async function adminGetProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const profile = await getAdminProfile(user.sub);
    sendSuccess(res, profile, "Profile fetched successfully");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/trigger/matching
 *
 * Manually fires one binary matching cycle.
 * Intended for error recovery when the cron scheduler missed a boundary
 * (e.g. server was down at 00:00 or 12:00).
 *
 * Requires SUPER_ADMIN or FINANCE_ADMIN role (enforced in router).
 */
export async function triggerMatchingCycle(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await runMatchingCycle();
    sendSuccess(res, { triggered: true }, "Binary matching cycle triggered successfully");
  } catch (err) {
    next(err);
  }
}
