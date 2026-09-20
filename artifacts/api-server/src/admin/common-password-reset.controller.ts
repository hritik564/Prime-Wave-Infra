import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { HTTP_STATUS } from "../shared/constants";
import {
  recoverStrandedCommonPasswordResetRun,
  requestCommonPasswordResetEmergencyStop,
  executeCommonPasswordReset,
  getCommonPasswordResetPreview,
  getCommonPasswordResetStatus,
} from "./common-password-reset.service";
import type { CommonPasswordResetExecuteInput } from "./common-password-reset.schema";

export async function previewCommonPasswordResetHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(
      res,
      await getCommonPasswordResetPreview(),
      "Common temporary password reset preview generated",
    );
  } catch (error) {
    next(error);
  }
}

export async function executeCommonPasswordResetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    sendSuccess(
      res,
      await executeCommonPasswordReset(
        user.sub,
        req.body as CommonPasswordResetExecuteInput,
      ),
      "Common temporary password reset accepted for background processing",
      HTTP_STATUS.ACCEPTED,
    );
  } catch (error) {
    next(error);
  }
}

export async function getCommonPasswordResetStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const runId = String(req.params["runId"] ?? "");
    sendSuccess(
      res,
      await getCommonPasswordResetStatus(user.sub, runId),
      "Common temporary password reset status retrieved",
    );
  } catch (error) {
    next(error);
  }
}

export async function emergencyStopCommonPasswordResetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const runId = String(req.params["runId"] ?? "");
    sendSuccess(
      res,
      await requestCommonPasswordResetEmergencyStop(user.sub, runId),
      "Common temporary password reset stopped safely for performance recovery",
    );
  } catch (error) {
    next(error);
  }
}

export async function recoverStrandedCommonPasswordResetHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const runId = String(req.params["runId"] ?? "");
    sendSuccess(
      res,
      await recoverStrandedCommonPasswordResetRun(user.sub, runId),
      "Stranded common temporary password reset recovered safely",
    );
  } catch (error) {
    next(error);
  }
}