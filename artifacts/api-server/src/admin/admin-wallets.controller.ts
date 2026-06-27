import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import {
  getAdminWallets,
  getAdminWalletStats,
  getAdminWalletById,
  saveWalletNotes,
} from "./admin-wallets.service";
import type {
  AdminWalletListQuery,
  SaveWalletNotesInput,
} from "./admin-wallets.schema";

export async function getAdminWalletsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<AdminWalletListQuery>(res, "query");
    const result = await getAdminWallets(query);
    sendSuccess(res, result, "Wallets retrieved");
  } catch (err) { next(err); }
}

export async function getAdminWalletStatsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const result = await getAdminWalletStats();
    sendSuccess(res, result, "Wallet stats retrieved");
  } catch (err) { next(err); }
}

export async function getAdminWalletByIdHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = String(req.params["userId"] ?? "");
    const result = await getAdminWalletById(userId);
    sendSuccess(res, result, "Wallet detail retrieved");
  } catch (err) { next(err); }
}

export async function saveWalletNotesHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }   = req as AuthenticatedRequest;
    const userId     = String(req.params["userId"] ?? "");
    const input      = req.body as SaveWalletNotesInput;
    const result     = await saveWalletNotes(user.sub, userId, input);
    sendSuccess(res, result, "Notes saved");
  } catch (err) { next(err); }
}
