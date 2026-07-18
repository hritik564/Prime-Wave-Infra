import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import {
  getAdminWithdrawals,
  getAdminWithdrawalStats,
  getAdminWithdrawalById,
  holdWithdrawal,
  updateWithdrawalNotes,
  approveWithdrawal,
  completeWithdrawal,
  rejectWithdrawal,
} from "./admin-withdrawals.service";
import { getWithdrawalSettingsPublic, updateWithdrawalSettings } from "../withdrawals/withdrawals.service";
import { getQueueItems } from "../withdrawals/withdrawal-queue.service";
import { processPendingWithdrawals } from "../withdrawals/withdrawal-processor.service";
import { getWithdrawalEvents } from "../withdrawals/withdrawal-events.service";
import {
  getWithdrawalEngineStatus,
  setWithdrawalEngineEnabled,
} from "../withdrawals/withdrawal-engine.service";
import { getOperationalHealth } from "../withdrawals/withdrawal-operational-health.service";
import { isWorkerLocked } from "../withdrawals/withdrawal-auto-worker.service";
import type {
  AdminWithdrawalListQuery,
  ApproveWithdrawalInput,
  CompleteWithdrawalInput,
  RejectWithdrawalInput,
  HoldWithdrawalInput,
  UpdateWithdrawalNotesInput,
  UpdateWithdrawalSettingsInput,
} from "../withdrawals/withdrawals.schema";

export async function getAdminWithdrawalSettingsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const result = await getWithdrawalSettingsPublic("BEP20");
    sendSuccess(res, result, "Withdrawal settings retrieved");
  } catch (err) { next(err); }
}

export async function updateAdminWithdrawalSettingsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const input  = req.body as UpdateWithdrawalSettingsInput;
    const result = await updateWithdrawalSettings("BEP20", input);
    sendSuccess(res, result, "Withdrawal settings updated");
  } catch (err) { next(err); }
}

export async function getAdminWithdrawalsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<AdminWithdrawalListQuery>(res, "query");
    const result = await getAdminWithdrawals(query);
    sendSuccess(res, result, "Withdrawals retrieved");
  } catch (err) { next(err); }
}

export async function getAdminWithdrawalStatsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const result = await getAdminWithdrawalStats();
    sendSuccess(res, result, "Withdrawal stats retrieved");
  } catch (err) { next(err); }
}

export async function getAdminWithdrawalByIdHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const withdrawalId = String(req.params["id"] ?? "");
    const result       = await getAdminWithdrawalById(withdrawalId);
    sendSuccess(res, result, "Withdrawal retrieved");
  } catch (err) { next(err); }
}

export async function holdWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as HoldWithdrawalInput;
    const result       = await holdWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal placed on hold");
  } catch (err) { next(err); }
}

export async function updateWithdrawalNotesHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as UpdateWithdrawalNotesInput;
    const result       = await updateWithdrawalNotes(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Notes updated");
  } catch (err) { next(err); }
}

export async function approveWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as ApproveWithdrawalInput;
    const result       = await approveWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal approved");
  } catch (err) { next(err); }
}

export async function completeWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as CompleteWithdrawalInput;
    const result       = await completeWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal completed successfully");
  } catch (err) { next(err); }
}

export async function rejectWithdrawalHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }     = req as AuthenticatedRequest;
    const withdrawalId = String(req.params["id"] ?? "");
    const input        = req.body as RejectWithdrawalInput;
    const result       = await rejectWithdrawal(user.sub, withdrawalId, input);
    sendSuccess(res, result, "Withdrawal rejected");
  } catch (err) { next(err); }
}

export async function getWithdrawalQueueHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const result = await getQueueItems();
    sendSuccess(res, result, "Withdrawal queue retrieved");
  } catch (err) { next(err); }
}

export async function triggerProcessQueueHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (isWorkerLocked()) {
      res.status(409).json({
        success: false,
        message: "Queue processor already running — automatic worker is active",
      });
      return;
    }
    const result = await processPendingWithdrawals();
    sendSuccess(res, result, "Queue processing complete");
  } catch (err) { next(err); }
}

export async function getWithdrawalEventsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const withdrawalId = String(req.params["id"] ?? "");
    const result       = await getWithdrawalEvents(withdrawalId);
    sendSuccess(res, result, "Withdrawal events retrieved");
  } catch (err) { next(err); }
}

export async function getWithdrawalEngineStatusHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const result = await getWithdrawalEngineStatus();
    sendSuccess(res, result, "Withdrawal engine status retrieved");
  } catch (err) { next(err); }
}

export async function setWithdrawalEngineStatusHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }  = req as AuthenticatedRequest;
    const { enabled } = req.body as { enabled: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ success: false, message: "enabled must be a boolean" });
      return;
    }
    await setWithdrawalEngineEnabled(enabled, user.sub);
    const status = await getWithdrawalEngineStatus();
    sendSuccess(res, status, `Withdrawal engine ${enabled ? "enabled" : "disabled"}`);
  } catch (err) { next(err); }
}

export async function getWithdrawalOperationalHealthHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const result = await getOperationalHealth();
    sendSuccess(res, result, "Operational health retrieved");
  } catch (err) { next(err); }
}
