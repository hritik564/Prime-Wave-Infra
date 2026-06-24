import type { Request, Response, NextFunction } from "express";
import {
  getWalletBalances,
  transferIncomeToWithdrawal,
  getWalletHistory,
} from "./wallets.service";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { TransferInput, HistoryQueryInput } from "./wallets.schema";

export async function getWallet(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const wallet = await getWalletBalances(user.sub);
    sendSuccess(res, wallet, "Wallet fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function transfer(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result = await transferIncomeToWithdrawal(user.sub, req.body as TransferInput);
    sendSuccess(res, result, "Transfer completed successfully");
  } catch (err) {
    next(err);
  }
}

export async function getHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    // Use getParsed() — validate(historyQuerySchema, "query") stored coerced
    // data in res.locals because req.query is read-only in Express 5.
    const query = getParsed<HistoryQueryInput>(res, "query");
    const result = await getWalletHistory(user.sub, query);
    sendSuccess(res, result, "Transaction history fetched successfully");
  } catch (err) {
    next(err);
  }
}
