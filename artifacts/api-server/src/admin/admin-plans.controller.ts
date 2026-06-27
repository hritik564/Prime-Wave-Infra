import type { Response } from "express";
import type { AuthenticatedRequest } from "../shared/types";
import { sendSuccess, sendCreated } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import {
  getAllPlanConfig,
  saveConfigField,
  getConfigVersions,
  getConfigAudit,
  getPlans,
  createPlan,
  updatePlanStatus,
  getLevelConfig,
  saveLevelConfig,
  getSalaryRanks,
} from "./admin-plans.service";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getAllPlanConfigHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getAllPlanConfig();
  sendSuccess(res, data, "Config fetched");
}

export async function saveConfigFieldHandler(req: AuthenticatedRequest, res: Response) {
  const { key }                         = getParsed(res, "params") as { key: string };
  const { value, oldValue, reason, label } = req.body as { value: string; oldValue?: string; reason: string; label?: string };
  const adminId    = req.user.sub;
  const adminEmail = req.user.email;
  const data = await saveConfigField(key, value, oldValue ?? "", reason, label ?? key, adminId, adminEmail);
  sendSuccess(res, data, "Config saved");
}

// ─── Versions & Audit ────────────────────────────────────────────────────────

export async function getVersionsHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getConfigVersions();
  sendSuccess(res, { versions: data }, "Versions fetched");
}

export async function getAuditHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getConfigAudit();
  sendSuccess(res, { entries: data }, "Audit fetched");
}

// ─── Plans ────────────────────────────────────────────────────────────────────

export async function getPlansHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getPlans();
  sendSuccess(res, { plans: data }, "Plans fetched");
}

export async function createPlanHandler(req: AuthenticatedRequest, res: Response) {
  const body = req.body as {
    name: string; color?: string; minInvest: number; maxInvest: number | null;
    roi: number; duration: number; autoCompound: boolean;
    benefits?: string[]; notes?: string; claimWindow?: string;
  };
  const adminId    = req.user.sub;
  const adminEmail = req.user.email;
  const plan = await createPlan({
    name:         body.name,
    color:        body.color        ?? "#60a5fa",
    minInvest:    body.minInvest,
    maxInvest:    body.maxInvest,
    roi:          body.roi,
    duration:     body.duration,
    autoCompound: body.autoCompound,
    status:       "ACTIVE",
    benefits:     body.benefits     ?? [],
    notes:        body.notes        ?? "",
    claimWindow:  body.claimWindow  ?? "24 hours",
  }, adminId, adminEmail);
  sendCreated(res, plan, "Plan created");
}

export async function updatePlanStatusHandler(req: AuthenticatedRequest, res: Response) {
  const { id }     = getParsed(res, "params") as { id: string };
  const { status } = req.body as { status: "ACTIVE" | "INACTIVE" | "ARCHIVED" };
  const adminId    = req.user.sub;
  const adminEmail = req.user.email;
  if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) {
    throw new AppError("Invalid status", HTTP_STATUS.BAD_REQUEST, "VALIDATION_ERROR");
  }
  const plan = await updatePlanStatus(id, status, adminId, adminEmail);
  sendSuccess(res, plan, "Plan status updated");
}

// ─── Level Config ─────────────────────────────────────────────────────────────

export async function getLevelConfigHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getLevelConfig();
  sendSuccess(res, { levels: data }, "Level config fetched");
}

export async function saveLevelConfigHandler(req: AuthenticatedRequest, res: Response) {
  const { levels } = req.body as { levels: { level: number; rate: number; qualification: string; status: "ACTIVE" | "INACTIVE" }[] };
  const adminId    = req.user.sub;
  const adminEmail = req.user.email;
  await saveLevelConfig(levels, adminId, adminEmail);
  sendSuccess(res, { levels }, "Level config saved");
}

// ─── Salary Ranks ─────────────────────────────────────────────────────────────

export async function getSalaryRanksHandler(req: AuthenticatedRequest, res: Response) {
  const data = await getSalaryRanks();
  sendSuccess(res, { ranks: data }, "Salary ranks fetched");
}
