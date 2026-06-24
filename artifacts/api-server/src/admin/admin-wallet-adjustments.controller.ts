import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { applyWalletAdjustment } from "./admin-wallet-adjustments.service";
import type { WalletAdjustmentInput } from "./admin-dashboard.schema";

export async function walletAdjustmentHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const input    = req.body as WalletAdjustmentInput;
    const result   = await applyWalletAdjustment(user.sub, input);
    sendSuccess(res, result, "Wallet adjustment applied successfully");
  } catch (err) { next(err); }
}
