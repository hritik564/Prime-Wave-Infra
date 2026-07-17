import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess, sendCreated } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import {
  listWalletAddresses,
  addWalletAddress,
  deleteWalletAddress,
  setPrimaryWalletAddress,
} from "./wallet-addresses.service";
import type { AddWalletAddressInput } from "./wallet-addresses.schema";

export async function listWalletAddressesHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const network  = req.query["network"] as "BEP20" | undefined;
    const result   = await listWalletAddresses(user.sub, network);
    sendSuccess(res, result, "Wallet addresses retrieved");
  } catch (err) { next(err); }
}

export async function addWalletAddressHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as AddWalletAddressInput;
    const result   = await addWalletAddress(user.sub, input);
    sendCreated(res, result, "Wallet address added");
  } catch (err) { next(err); }
}

export async function deleteWalletAddressHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const addressId = String(req.params["id"] ?? "");
    const result    = await deleteWalletAddress(user.sub, addressId);
    sendSuccess(res, result, "Wallet address removed");
  } catch (err) { next(err); }
}

export async function setPrimaryWalletAddressHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const addressId = String(req.params["id"] ?? "");
    const result    = await setPrimaryWalletAddress(user.sub, addressId);
    sendSuccess(res, result, "Primary wallet address updated");
  } catch (err) { next(err); }
}
