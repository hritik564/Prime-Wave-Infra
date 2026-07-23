import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { executeP0PowerBvRecovery, type P0RecoveryInput } from "./admin-p0-recovery.service";

export async function p0PowerBvRecoveryHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as P0RecoveryInput;
    const result   = await executeP0PowerBvRecovery(user.sub, input);
    sendSuccess(res, result, "P0 Power BV recovery executed successfully");
  } catch (err) { next(err); }
}
