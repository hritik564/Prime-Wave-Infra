import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest }  from "../shared/types";
import { sendSuccess }                from "../shared/response";
import {
  listCompanyWallets,
  updateCompanyWalletAddress,
} from "./admin-company-wallets.service";

export async function listCompanyWalletsHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const wallets = await listCompanyWallets();
    sendSuccess(res, { wallets });
  } catch (err) {
    next(err);
  }
}

export async function updateCompanyWalletHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id }            = req.params as { id: string };
    const { walletAddress } = req.body   as { walletAddress: string };
    const adminId           = req.user!.sub;
    const ip                = req.ip;

    const updated = await updateCompanyWalletAddress(adminId, id, walletAddress, ip);
    sendSuccess(res, { wallet: updated });
  } catch (err) {
    next(err);
  }
}
