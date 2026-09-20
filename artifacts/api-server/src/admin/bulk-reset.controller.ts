import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import {
  downloadBulkPasswordResetArtifact,
  executeBulkPasswordReset,
  getBulkPasswordResetPreview,
  markDeadBulkPasswordResetRunFailed,
  BulkPasswordResetStoppedError,
} from "./bulk-reset.service";
import type { BulkPasswordResetExecuteInput } from "./bulk-reset.schema";

export async function previewBulkPasswordResetHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const preview = await getBulkPasswordResetPreview();
    sendSuccess(res, preview, "Bulk password reset preview generated");
  } catch (error) {
    if (error instanceof BulkPasswordResetStoppedError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
        data: {
          runId: error.runId,
          processedCount: error.processedCount,
        },
      });
      return;
    }
    next(error);
  }
}

export async function executeBulkPasswordResetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result = await executeBulkPasswordReset(
      user.sub,
      req.body as BulkPasswordResetExecuteInput,
    );
    sendSuccess(res, result, "Bulk password reset completed");
  } catch (error) {
    next(error);
  }
}

export async function markDeadBulkPasswordResetRunFailedHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const runId = String(req.params["runId"] ?? "");
    sendSuccess(
      res,
      await markDeadBulkPasswordResetRunFailed(user.sub, runId),
      "Dead bulk password reset run marked failed",
    );
  } catch (error) {
    next(error);
  }
}

export async function downloadBulkPasswordResetArtifactHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const runId = String(req.params["runId"] ?? "");
    const artifact = await downloadBulkPasswordResetArtifact(user.sub, runId);
    res
      .status(200)
      .setHeader("Content-Type", "application/jsonl")
      .setHeader("Content-Disposition", `attachment; filename="bulk-password-reset-${runId}.jsonl"`)
      .send(artifact);
  } catch (error) {
    next(error);
  }
}