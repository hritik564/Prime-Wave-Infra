import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { setWithdrawalHold, getWithdrawalHoldStatus } from "./admin-withdrawal-hold.service";
import type { SetWithdrawalHoldInput } from "./admin-withdrawal-hold.schema";

export async function setWithdrawalHoldHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const userId   = String(req.params["id"] ?? "");
    const input    = req.body as SetWithdrawalHoldInput;
    const result   = await setWithdrawalHold(user.sub, userId, input.hold, input.reason);
    sendSuccess(res, result, input.hold ? "Withdrawal hold enabled" : "Withdrawal hold removed");
  } catch (err) { next(err); }
}

export async function getWithdrawalHoldHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = String(req.params["id"] ?? "");
    const result = await getWithdrawalHoldStatus(userId);
    sendSuccess(res, result, "Withdrawal hold status retrieved");
  } catch (err) { next(err); }
}
