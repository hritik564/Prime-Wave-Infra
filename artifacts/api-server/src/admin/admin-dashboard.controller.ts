import { type Request, type Response, type NextFunction } from "express";
import { sendSuccess } from "../shared/response";
import { getDashboardStats, getSystemHealth } from "./admin-dashboard.service";

export async function getDashboardHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const stats = await getDashboardStats();
    sendSuccess(res, stats, "Dashboard stats retrieved");
  } catch (err) { next(err); }
}

export async function getSystemHealthHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const health = await getSystemHealth();
    sendSuccess(res, health, "System health retrieved");
  } catch (err) { next(err); }
}
