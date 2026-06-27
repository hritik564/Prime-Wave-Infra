import type { Response } from "express";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import {
  getEngineDashboard,
  getEngineList,
  getEngineDetail,
  saveEngineNotes,
  getReleaseQueue,
} from "./admin-engine.service";

export async function engineDashboardHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getEngineDashboard();
  sendSuccess(res, data, "Engine dashboard fetched");
}

export async function engineListHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getEngineList();
  sendSuccess(res, data, "Engine list fetched");
}

export async function engineDetailHandler(req: AuthenticatedRequest, res: Response) {
  const { engineId } = getParsed(res, "params") as { engineId: string };
  const data = await getEngineDetail(engineId);
  sendSuccess(res, data, "Engine detail fetched");
}

export async function saveEngineNotesHandler(req: AuthenticatedRequest, res: Response) {
  const { engineId } = getParsed(res, "params") as { engineId: string };
  const { notes }    = req.body as { notes: string };

  const adminId    = res.locals.auth?.sub as string;
  const adminEmail = res.locals.auth?.email as string;

  const data = await saveEngineNotes(engineId, notes, adminId, adminEmail);
  sendSuccess(res, data, "Engine notes saved");
}

export async function releaseQueueHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getReleaseQueue();
  sendSuccess(res, data, "Release queue fetched");
}
