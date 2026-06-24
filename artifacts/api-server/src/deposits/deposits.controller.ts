import type { Request, Response, NextFunction } from "express";
import {
  getActiveCompanyWallets,
  createDepositRequest,
  getDepositHistory,
  getDepositById,
} from "./deposits.service";
import { sendSuccess, sendCreated } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { CreateDepositInput, DepositHistoryQuery } from "./deposits.schema";

export async function getCompanyWalletsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const wallets = await getActiveCompanyWallets();
    sendSuccess(res, wallets, "Company wallets fetched successfully");
  } catch (err) { next(err); }
}

export async function createDepositHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as CreateDepositInput;
    const deposit  = await createDepositRequest(user.sub, input);
    sendCreated(res, deposit, "Deposit request submitted successfully");
  } catch (err) { next(err); }
}

export async function getDepositHistoryHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<DepositHistoryQuery>(res, "query");
    const result   = await getDepositHistory(user.sub, query);
    sendSuccess(res, result, "Deposit history fetched successfully");
  } catch (err) { next(err); }
}

export async function getDepositByIdHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const depositId = String(req.params["id"] ?? "");
    const deposit   = await getDepositById(user.sub, depositId);
    sendSuccess(res, deposit, "Deposit fetched successfully");
  } catch (err) { next(err); }
}
