import type { Request, Response, NextFunction } from "express";
import {
  getActiveCompanyWallets,
  getCompanyWalletQrObject,
  getDepositHistory,
  getDepositById,
} from "./deposits.service";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { DepositHistoryQuery } from "./deposits.schema";

export async function getCompanyWalletsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const wallets = await getActiveCompanyWallets();
    sendSuccess(res, wallets, "Company wallets fetched successfully");
  } catch (err) { next(err); }
}

export async function getCompanyWalletQrHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const bytes = await getCompanyWalletQrObject(String(req.params["id"] ?? ""), true);
    res.type("png").set("Cache-Control", "public, max-age=300").send(bytes);
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
