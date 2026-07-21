import type { Request, Response, NextFunction } from "express";
import {
  getSalaryHistory,
  getSalarySummary,
  getSalaryAchievements,
  getSalaryQualificationSummary,
  getUpcomingRun,
} from "./salary.service";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type {
  SalaryHistoryQuery,
  SalarySummaryQuery,
  SalaryAchievementsQuery,
} from "./salary.schema";

export async function getSalaryQualificationsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<SalarySummaryQuery>(res, "query");
    const result   = await getSalaryQualificationSummary(query.userId ?? user.sub);
    sendSuccess(res, result, "Salary qualifications fetched successfully");
  } catch (err) { next(err); }
}

export async function getSalaryHistoryHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<SalaryHistoryQuery>(res, "query");
    const result   = await getSalaryHistory(query.userId ?? user.sub, query);
    sendSuccess(res, result, "Salary history fetched successfully");
  } catch (err) { next(err); }
}

export async function getSalarySummaryHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<SalarySummaryQuery>(res, "query");
    const result   = await getSalarySummary(query.userId ?? user.sub);
    sendSuccess(res, result, "Salary summary fetched successfully");
  } catch (err) { next(err); }
}

export async function getSalaryAchievementsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<SalaryAchievementsQuery>(res, "query");
    const result   = await getSalaryAchievements(query.userId ?? user.sub, query);
    sendSuccess(res, result, "Salary achievements fetched successfully");
  } catch (err) { next(err); }
}

export async function getUpcomingRunHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result   = await getUpcomingRun(user.sub);
    sendSuccess(res, result, "Upcoming salary run fetched successfully");
  } catch (err) { next(err); }
}
