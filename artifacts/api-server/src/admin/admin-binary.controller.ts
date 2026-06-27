import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../shared/response";
import type { AuthenticatedRequest } from "../shared/types";
import { getParsed } from "../middleware/validate.middleware";
import type { AdminBinaryListQuery, SaveBinaryNotesInput } from "./admin-binary.schema";
import {
  getAdminBinaryNetwork,
  getAdminBinaryStats,
  getAdminBinaryDetail,
  saveAdminBinaryNotes,
} from "./admin-binary.service";

export async function getAdminBinaryNetworkHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<AdminBinaryListQuery>(res, "query");
    const result = await getAdminBinaryNetwork(query);
    sendSuccess(res, result, "Binary network fetched");
  } catch (err) {
    next(err);
  }
}

export async function getAdminBinaryStatsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const stats = await getAdminBinaryStats();
    sendSuccess(res, stats, "Binary stats fetched");
  } catch (err) {
    next(err);
  }
}

export async function getAdminBinaryDetailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.params as { userId: string };
    const node = await getAdminBinaryDetail(userId);
    sendSuccess(res, node, "Binary detail fetched");
  } catch (err) {
    next(err);
  }
}

export async function saveAdminBinaryNotesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId }   = req.params as { userId: string };
    const input        = req.body as SaveBinaryNotesInput;
    const { user }     = req as AuthenticatedRequest;
    const result       = await saveAdminBinaryNotes(user.sub, userId, input);
    sendSuccess(res, result, "Notes saved");
  } catch (err) {
    next(err);
  }
}
