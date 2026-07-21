import type { Request, Response, NextFunction } from "express";
import { loginAdmin, getAdminProfile } from "./admin.service";
import { runMatchingCycle } from "../binary/matching.engine";
import { runOrbitCycle } from "../binary/orbit.engine";
import { processRoiCycle } from "../cron/roi.engine";
import { seedBinaryTree } from "./admin-seed.service";
import { repairSeedInvestments } from "./admin-repair.service";
import { getAllSettings, setSetting } from "../config/settings";
import { sendSuccess } from "../shared/response";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminLoginInput } from "./admin.schema";
import type { AuthenticatedRequest } from "../shared/types";

export async function adminLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await loginAdmin(req.body as AdminLoginInput);
    sendSuccess(res, result, "Admin login successful");
  } catch (err) {
    next(err);
  }
}

export async function adminGetProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const profile = await getAdminProfile(user.sub);
    sendSuccess(res, profile, "Profile fetched successfully");
  } catch (err) {
    next(err);
  }
}

// ── Manual cycle triggers ─────────────────────────────────────────────────────

/**
 * POST /api/admin/trigger/matching
 * Manually fires one binary matching cycle (error recovery).
 */
export async function triggerMatchingCycle(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await runMatchingCycle();
    sendSuccess(res, { triggered: true }, "Binary matching cycle triggered successfully");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/trigger/orbit
 * Manually fires one binary orbit cycle (error recovery).
 */
export async function triggerOrbitCycle(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await runOrbitCycle();
    sendSuccess(res, { triggered: true }, "Binary orbit cycle triggered successfully");
  } catch (err) {
    next(err);
  }
}

// ── System settings ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/settings
 * Returns all system settings.
 */
export async function listSettings(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const settings = await getAllSettings();
    sendSuccess(res, settings, "Settings fetched successfully");
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/settings/:key
 * Updates a single setting value.
 */
export async function updateSetting(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { key } = req.params as { key: string };
    const { value } = req.body as { value?: unknown };

    if (value === undefined || value === null || String(value).trim() === "") {
      throw new AppError("value is required", HTTP_STATUS.BAD_REQUEST, "VALIDATION_ERROR");
    }

    await setSetting(key, String(value));
    sendSuccess(res, { key, value: String(value) }, "Setting updated successfully");
  } catch (err) {
    next(err);
  }
}

export async function triggerSeedBinaryTree(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await seedBinaryTree();
    sendSuccess(res, result, result.alreadySeeded ? "Already seeded" : "Seed complete");
  } catch (err) {
    next(err);
  }
}

// ── Seed repair trigger ───────────────────────────────────────────────────────
export async function triggerRepairSeedInvestments(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const report = await repairSeedInvestments();
    sendSuccess(res, report, "Seed investment repair complete");
  } catch (err) {
    next(err);
  }
}

// ── ROI cycle trigger ─────────────────────────────────────────────────────────
// Accepts optional body { cycles: number } (1–30). Each cycle = one 12-hour ROI slice.
export async function triggerRoiCycle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw    = (req.body as { cycles?: unknown }).cycles;
    const cycles = typeof raw === "number" && raw >= 1 && raw <= 30 ? Math.floor(raw) : 1;

    for (let i = 0; i < cycles; i++) {
      await processRoiCycle();
    }

    sendSuccess(res, { cycles }, `ROI cycle ran ${cycles} time(s)`);
  } catch (err) {
    next(err);
  }
}

