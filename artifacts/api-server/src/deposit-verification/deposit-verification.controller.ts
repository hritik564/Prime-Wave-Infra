import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess, sendCreated } from "../shared/response";
import { HTTP_STATUS } from "../shared/constants";
import { AppError } from "../middleware/error.middleware";
import { getParsed } from "../middleware/validate.middleware";
import * as service from "./deposit-verification.service";
import * as repo from "./deposit-verification.repository";
import type { z } from "zod";
import type {
  verificationStatusSchema,
  adminListVerificationsSchema,
  adminGetVerificationSchema,
} from "./deposit-verification.schema";

type VerificationStatusParams    = z.infer<typeof verificationStatusSchema>;
type AdminListVerificationsQuery = z.infer<typeof adminListVerificationsSchema>;
type AdminGetVerificationParams  = z.infer<typeof adminGetVerificationSchema>;

// ── User controllers ──────────────────────────────────────────────────────────

/**
 * POST /api/deposit-verifications/submit
 * Submit a transaction hash for automatic verification.
 */
export async function submitVerification(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { txHash, network } = req.body as { txHash: string; network: string };
    const userId = req.user!.sub;

    const verification = await service.submitVerification(userId, txHash, network);

    sendCreated(res, {
      verificationId: verification.id,
      status:         verification.verificationStatus,
      txHash:         verification.txHash,
      network:        verification.network,
      createdAt:      verification.createdAt,
      message:        "Transaction submitted for verification. Use the verificationId to track progress.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/deposit-verifications/:id/status
 * Poll verification status (user-scoped).
 */
export async function getVerificationStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }   = getParsed<VerificationStatusParams>(res, "params");
    const userId   = req.user!.sub;
    const v        = await service.getVerificationStatus(id, userId);

    const isTerminal = ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"].includes(v.verificationStatus);
    const isActive   = ["TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS", "CONFIRMED", "CREDITED"].includes(v.verificationStatus);

    sendSuccess(res, {
      id:                    v.id,
      txHash:                v.txHash,
      network:               v.network,
      verificationStatus:    v.verificationStatus,
      confirmations:         v.confirmations,
      requiredConfirmations: v.requiredConfirmations,
      blockchainAmount:      v.blockchainAmount,
      senderAddress:         v.senderAddress,
      failureReason:         v.failureReason,
      firstSeenAt:           v.firstSeenAt,
      confirmedAt:           v.confirmedAt,
      creditedAt:            v.creditedAt,
      completedAt:           v.completedAt,
      createdAt:             v.createdAt,
      isTerminal,
      isActive,
    });
  } catch (err) {
    next(err);
  }
}

// ── Admin controllers ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/deposit-verifications
 * List verifications with filters (admin-only).
 */
export async function adminListVerifications(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, status, network, search } = getParsed<AdminListVerificationsQuery>(res, "query");
    const result = await repo.adminList({ page, limit, status, network, search });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/deposit-verifications/:id
 * Full verification detail (admin-only).
 */
export async function adminGetVerification(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = getParsed<AdminGetVerificationParams>(res, "params");
    const v      = await repo.findById(id);
    if (!v) {
      throw new AppError("Verification not found", HTTP_STATUS.NOT_FOUND, "VERIFICATION_NOT_FOUND");
    }
    sendSuccess(res, v);
  } catch (err) {
    next(err);
  }
}
