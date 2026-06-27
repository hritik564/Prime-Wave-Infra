import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import {
  getAdminWithdrawals,
  getAdminWithdrawalStats,
  getAdminWithdrawalById,
  holdWithdrawal,
  updateWithdrawalNotes,
  approveWithdrawal,
  completeWithdrawal,
  rejectWithdrawal,
} from "./admin-withdrawals.service";
import type {
  AdminWithdrawalListQuery,
  ApproveWithdrawalInput,
  CompleteWithdrawalInput,
  RejectWithdrawalInput,
  HoldWithdrawalInput,
  UpdateWithdrawalNotesInput,
} from "../withdrawals/withdrawals.schema";

export async function getAdminWithdrawalsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<AdminWithdrawalListQuery>(res, "query");
    const result = await getAdminWithdrawals(query);
    sendSuccess(res, result, "Withdrawals retrieved");
  } catch (err) { next(err); }
}

export async function getAdminWithdrawalStatsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const result = await getAdminWithdrawalStats();
    sendSuccess(res, result, "Withdrawal stats retrieved");
  } catch (err) { next(err); }
}

export async function getAdminWithdrawalByIdHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const withdrawalId = String(req.params["id"] ?? "");
    const result       = await getAdminWithdrawalById(withdrawalId);
    sendSuccess(res, result, "Withdrawal retrieved");
  } catch (err) { next(err); }
}

export async function holdWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as HoldWithdrawalInput;
    const result       = await holdWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal placed on hold");
  } catch (err) { next(err); }
}

export async function updateWithdrawalNotesHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as UpdateWithdrawalNotesInput;
    const result       = await updateWithdrawalNotes(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Notes updated");
  } catch (err) { next(err); }
}

export async function approveWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as ApproveWithdrawalInput;
    const result       = await approveWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal approved");
  } catch (err) { next(err); }
}

export async function completeWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as CompleteWithdrawalInput;
    const result       = await completeWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal completed successfully");
  } catch (err) { next(err); }
}

export async function rejectWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as RejectWithdrawalInput;
    const result       = await rejectWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal rejected");
  } catch (err) { next(err); }
}
