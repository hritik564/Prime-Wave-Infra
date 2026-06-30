import type { Request, Response, NextFunction } from "express";
import {
  getAdminDeposits,
  getPendingDeposits,
  getDepositById,
  getDepositStats,
  approveDeposit,
  rejectDeposit,
  markDepositConfirming,
  createManualAdminDeposit,
  creditUserWallet,
} from "./admin-deposits.service";
import { sendSuccess, sendCreated } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { AdminDepositListQuery, RejectDepositInput, ManualAdminDepositInput, WalletCreditInput } from "../deposits/deposits.schema";

export async function getAdminDepositsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<AdminDepositListQuery>(res, "query");
    const result = await getAdminDeposits(query);
    sendSuccess(res, result, "Deposits fetched successfully");
  } catch (err) { next(err); }
}

export async function getPendingDepositsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<AdminDepositListQuery>(res, "query");
    const result = await getPendingDeposits(query);
    sendSuccess(res, result, "Pending deposits fetched successfully");
  } catch (err) { next(err); }
}

export async function getDepositByIdHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const depositId = String(req.params["id"] ?? "");
    const result    = await getDepositById(depositId);
    sendSuccess(res, result, "Deposit fetched successfully");
  } catch (err) { next(err); }
}

export async function getDepositStatsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const stats = await getDepositStats();
    sendSuccess(res, stats, "Deposit stats fetched successfully");
  } catch (err) { next(err); }
}

export async function approveDepositHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const depositId = String(req.params["id"] ?? "");
    const result    = await approveDeposit(user.sub, depositId);
    sendSuccess(res, result, "Deposit approved successfully");
  } catch (err) { next(err); }
}

export async function rejectDepositHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const depositId = String(req.params["id"] ?? "");
    const input     = req.body as RejectDepositInput;
    const result    = await rejectDeposit(user.sub, depositId, input);
    sendSuccess(res, result, "Deposit rejected successfully");
  } catch (err) { next(err); }
}

export async function markDepositConfirmingHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const depositId = String(req.params["id"] ?? "");
    const result    = await markDepositConfirming(user.sub, depositId);
    sendSuccess(res, result, "Deposit marked as confirming");
  } catch (err) { next(err); }
}

export async function createManualAdminDepositHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as ManualAdminDepositInput;
    const ip       = typeof req.ip === "string" ? req.ip : undefined;
    const result   = await createManualAdminDeposit(user.sub, input, ip);
    sendCreated(res, result, "Manual deposit credited successfully");
  } catch (err) { next(err); }
}

export async function creditUserWalletHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as WalletCreditInput;
    const ip       = typeof req.ip === "string" ? req.ip : undefined;
    const result   = await creditUserWallet(user.sub, input, ip);
    sendCreated(res, result, "Wallet credited successfully");
  } catch (err) { next(err); }
}
