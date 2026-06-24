import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess, sendCreated } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import {
  createWithdrawal,
  cancelWithdrawal,
  getWithdrawalHistory,
  getWithdrawalById,
} from "./withdrawals.service";
import type { CreateWithdrawalInput, WithdrawalHistoryQuery } from "./withdrawals.schema";

export async function createWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as CreateWithdrawalInput;
    const result   = await createWithdrawal(user.sub, input);
    sendCreated(res, result, "Withdrawal request submitted successfully");
  } catch (err) { next(err); }
}

export async function cancelWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const result       = await cancelWithdrawal(user.sub, withdrawalId);
    sendSuccess(res, result, "Withdrawal request cancelled");
  } catch (err) { next(err); }
}

export async function getWithdrawalHistoryHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<WithdrawalHistoryQuery>(res, "query");
    const result   = await getWithdrawalHistory(user.sub, query);
    sendSuccess(res, result, "Withdrawal history retrieved");
  } catch (err) { next(err); }
}

export async function getWithdrawalByIdHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const result       = await getWithdrawalById(user.sub, withdrawalId);
    sendSuccess(res, result, "Withdrawal retrieved");
  } catch (err) { next(err); }
}
