import type { Request, Response, NextFunction } from "express";
import { getWalletBalances, getWalletHistory } from "./wallets.service";
import {
  createIncomeTransfer,
  listIncomeTransfers,
  getIncomeTransfer,
} from "./income-transfer.service";
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
    const { amount } = req.body as TransferInput;
    const queued = await createIncomeTransfer(user.sub, amount);
    // Return updated balances so the UI can reflect the deduction immediately
    const wallet = await getWalletBalances(user.sub);
    sendSuccess(res, {
      transfer:                queued,
      incomeWalletBalance:     wallet.incomeWallet.toFixed(8),
      withdrawalWalletBalance: wallet.withdrawalWallet.toFixed(8),
    }, "Transfer queued. Funds will be released 1/72 per hour over 72 hours.");
  } catch (err) {
    next(err);
  }
}

export async function listTransfers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const q     = req.query as Record<string, string>;
    const page  = Math.max(1, parseInt(q.page  ?? "1",  10) || 1);
    const limit = Math.min(50, parseInt(q.limit ?? "10", 10) || 10);
    const result = await listIncomeTransfers(user.sub, page, limit);
    sendSuccess(res, result, "Transfers fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getTransferById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const id = (req.params as { id: string }).id;
    const result = await getIncomeTransfer(user.sub, id);
    sendSuccess(res, result, "Transfer fetched successfully");
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
    const query = getParsed<HistoryQueryInput>(res, "query");
    const result = await getWalletHistory(user.sub, query);
    sendSuccess(res, result, "Transaction history fetched successfully");
  } catch (err) {
    next(err);
  }
}
