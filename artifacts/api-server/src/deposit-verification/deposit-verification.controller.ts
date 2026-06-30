import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess, sendCreated } from "../shared/response";
import { HTTP_STATUS } from "../shared/constants";
import { AppError } from "../middleware/error.middleware";
import { getParsed } from "../middleware/validate.middleware";
import * as service from "./deposit-verification.service";
import * as repo from "./deposit-verification.repository";
import { prisma } from "../config/prisma";
import { getVerificationMetricsSnapshot } from "./deposit-verification.worker";
import type { z } from "zod";
import type {
  verificationStatusSchema,
  adminListVerificationsSchema,
  adminGetVerificationSchema,
  adminManualApproveParamsSchema,
  adminManualApproveBodySchema,
  adminRevalidateParamsSchema,
  adminRejectParamsSchema,
  adminRejectBodySchema,
  userHistorySchema,
} from "./deposit-verification.schema";

type VerificationStatusParams    = z.infer<typeof verificationStatusSchema>;
type AdminListVerificationsQuery = z.infer<typeof adminListVerificationsSchema>;
type AdminGetVerificationParams  = z.infer<typeof adminGetVerificationSchema>;
type AdminManualApproveParams    = z.infer<typeof adminManualApproveParamsSchema>;
type AdminManualApproveBody      = z.infer<typeof adminManualApproveBodySchema>;
type AdminRevalidateParams       = z.infer<typeof adminRevalidateParamsSchema>;
type AdminRejectParams           = z.infer<typeof adminRejectParamsSchema>;
type AdminRejectBody             = z.infer<typeof adminRejectBodySchema>;
type UserHistoryQuery            = z.infer<typeof userHistorySchema>;

// ── Terminal / active status sets ─────────────────────────────────────────────

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"] as const;
const ACTIVE_STATUSES   = [
  "TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS",
  "VERIFICATION_DELAYED", "CONFIRMED", "CREDITED",
] as const;

// ── User controllers ──────────────────────────────────────────────────────────

/**
 * POST /api/deposit-verifications/submit
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
 */
export async function getVerificationStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = getParsed<VerificationStatusParams>(res, "params");
    const userId = req.user!.sub;
    const v      = await service.getVerificationStatus(id, userId);

    const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(v.verificationStatus);
    const isActive   = (ACTIVE_STATUSES   as readonly string[]).includes(v.verificationStatus);

    sendSuccess(res, {
      id:                    v.id,
      txHash:                v.txHash,
      network:               v.network,
      verificationStatus:    v.verificationStatus,
      confirmations:         v.confirmations,
      requiredConfirmations: v.requiredConfirmations,
      blockchainAmount:      v.blockchainAmount,
      senderAddress:         v.senderAddress,
      recipientAddress:      v.recipientAddress,
      failureReason:         v.failureReason,
      verificationAttempts:  v.verificationAttempts,
      firstSeenAt:           v.firstSeenAt,
      lastCheckedAt:         v.lastCheckedAt,
      nextCheckAt:           v.nextCheckAt,
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

/**
 * GET /api/deposit-verifications/history
 * Returns all verifications for the authenticated user, newest first.
 * Every submitted TX hash appears immediately — source of truth for deposit history.
 */
export async function getUserVerificationHistory(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit } = getParsed<UserHistoryQuery>(res, "query");
    const userId = req.user!.sub;
    const result = await service.getUserVerificationHistory(userId, { page, limit });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// ── Admin controllers ─────────────────────────────────────────────────────────

/**
 * GET /api/admin/deposit-verifications
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
 * GET /api/admin/deposit-verifications/metrics
 */
export async function adminGetMetrics(
  _req: AuthenticatedRequest,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session     = getVerificationMetricsSnapshot();
    const allTimeRows = await repo.adminList({ page: 1, limit: 1 });
    sendSuccess(res, {
      session,
      allTime: { totalRecords: allTimeRows.meta.total },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/deposit-verifications/:id
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

/**
 * POST /api/admin/deposit-verifications/:id/retry
 *
 * Schedules a non-terminal verification for immediate re-check by setting
 * nextCheckAt = now. Does NOT bypass normal verification logic — the worker
 * picks it up on the next tick and runs the standard adapter pipeline.
 */
export async function adminRetryVerification(
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

    if ((TERMINAL_STATUSES as readonly string[]).includes(v.verificationStatus)) {
      throw new AppError(
        `Cannot retry a ${v.verificationStatus} verification — it has reached a terminal state`,
        HTTP_STATUS.CONFLICT,
        "VERIFICATION_TERMINAL",
      );
    }

    const now     = new Date();
    const updated = await prisma.depositVerification.update({
      where:  { id },
      data:   { nextCheckAt: now },
      select: { id: true, verificationStatus: true, nextCheckAt: true },
    });

    // Admin audit log (best-effort)
    try {
      await prisma.adminLog.create({
        data: {
          adminId:      req.user!.sub,
          action:       "DEPOSIT_VERIFICATION_RETRY_SCHEDULED",
          targetUserId: v.userId,
          details: {
            verificationId:  id,
            txHash:          v.txHash,
            previousStatus:  v.verificationStatus,
            scheduledAt:     updated.nextCheckAt,
            ipAddress:       req.ip,
          },
        },
      });
    } catch { /* non-fatal */ }

    sendSuccess(res, {
      id:                 updated.id,
      verificationStatus: updated.verificationStatus,
      nextCheckAt:        updated.nextCheckAt,
      message:            "Verification scheduled for immediate re-check on the next worker tick",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/deposit-verifications/:id/re-validate
 *
 * Re-queues a FAILED verification for blockchain re-check.
 * Transitions FAILED → VERIFYING. verificationAttempts and blockchain data preserved.
 * Creates DEPOSIT_REVALIDATION_REQUESTED audit log.
 */
export async function adminRevalidateVerification(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }  = getParsed<AdminRevalidateParams>(res, "params");
    const adminId = req.user!.sub;
    const ip      = req.ip;

    const result = await service.requestRevalidation(adminId, id, ip);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/deposit-verifications/:id/manual-approve
 *
 * Manually approves a non-terminal, blockchain-detected verification.
 * Reuses the existing approveDeposit() pipeline — no duplicate credit logic.
 * Requires a reason (min 15 chars). Creates audit log + user notification.
 */
export async function adminManualApproveVerification(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }     = getParsed<AdminManualApproveParams>(res, "params");
    const { reason } = req.body as AdminManualApproveBody;
    const adminId    = req.user!.sub;
    const ip         = req.ip;

    const result = await service.manualApproveVerification(adminId, id, reason, ip);

    sendSuccess(res, {
      ...result,
      message: "Deposit manually approved and credited to user's wallet",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/deposit-verifications/:id/reject
 *
 * Manually rejects a verification. Transitions to terminal REJECTED state.
 * Requires a mandatory reason. Creates audit log + user notification.
 */
export async function adminRejectVerification(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id }     = getParsed<AdminRejectParams>(res, "params");
    const { reason } = req.body as AdminRejectBody;
    const adminId    = req.user!.sub;
    const ip         = req.ip;

    const result = await service.manualRejectVerification(adminId, id, reason, ip);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
