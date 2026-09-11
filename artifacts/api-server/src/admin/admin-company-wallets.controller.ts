import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest }  from "../shared/types";
import { sendSuccess }                from "../shared/response";
import { AppError }                   from "../middleware/error.middleware";
import { HTTP_STATUS }                from "../shared/constants";
import {
  activateCompanyWallet,
  createCompanyWallet,
  deleteCompanyWallet,
  listCompanyWallets,
  uploadAndValidateCompanyWalletQr,
  updateCompanyWalletAddress,
} from "./admin-company-wallets.service";
import { parseCompanyWalletQrUpload } from "./admin-company-wallet-qr-upload";

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
    const { walletAddress, qrObjectPath } = req.body as {
      walletAddress?: string;
      qrObjectPath?: string;
    };
    const adminId           = req.user!.sub;
    const ip                = req.ip;

    const updated = await updateCompanyWalletAddress(adminId, id, walletAddress, qrObjectPath, ip);
    sendSuccess(res, { wallet: updated });
  } catch (err) {
    next(err);
  }
}

export async function createCompanyWalletHandler(
  req: AuthenticatedRequest, res: Response, next: NextFunction,
) {
  try {
    const { walletAddress, qrObjectPath } = req.body as { walletAddress: string; qrObjectPath: string };
    const wallet = await createCompanyWallet(req.user!.sub, walletAddress, qrObjectPath, req.ip);
    sendSuccess(res, { wallet }, "Deposit wallet saved successfully");
  } catch (err) {
    next(err);
  }
}

export async function uploadCompanyWalletQrHandler(
  req: AuthenticatedRequest, res: Response, next: NextFunction,
) {
  try {
    const upload = await parseCompanyWalletQrUpload(req);
    const objectPath = await uploadAndValidateCompanyWalletQr(upload.walletAddress, upload.bytes);
    sendSuccess(res, { objectPath }, "QR image uploaded and validated");
  } catch (err) {
    if (err instanceof Error && !("statusCode" in err)) {
      next(new AppError(err.message, HTTP_STATUS.UNPROCESSABLE_ENTITY, "QR_UPLOAD_INVALID"));
      return;
    }
    next(err);
  }
}

export async function activateCompanyWalletHandler(
  req: AuthenticatedRequest, res: Response, next: NextFunction,
) {
  try {
    const wallet = await activateCompanyWallet(req.user!.sub, String(req.params.id), req.ip);
    sendSuccess(res, { wallet }, "Deposit wallet is now current");
  } catch (err) {
    next(err);
  }
}

export async function deleteCompanyWalletHandler(
  req: AuthenticatedRequest, res: Response, next: NextFunction,
) {
  try {
    await deleteCompanyWallet(req.user!.sub, String(req.params.id), req.ip);
    sendSuccess(res, null, "Deposit wallet deleted");
  } catch (err) {
    next(err);
  }
}
