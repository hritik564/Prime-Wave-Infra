import { type Request, type Response, type NextFunction } from "express";
import { sendSuccess } from "../../shared/response";
import { getParsed } from "../../middleware/validate.middleware";
import {
  getRevenueReport,
  getDailyBusinessReport,
  getTopEarners,
  getTopSponsors,
  getRankDistribution,
  getNetworkDistribution,
  getPendingOperations,
  getRiskReport,
  getUserIncomeSummary,
} from "./reports.service";
import type { DateRangeQuery, TopListQuery, PaginatedDateRange } from "./reports.schema";

export async function revenueReportHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<DateRangeQuery>(res, "query");
    sendSuccess(res, await getRevenueReport(q), "Revenue report retrieved");
  } catch (err) { next(err); }
}

export async function dailyBusinessReportHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<PaginatedDateRange>(res, "query");
    sendSuccess(res, await getDailyBusinessReport(q), "Daily business report retrieved");
  } catch (err) { next(err); }
}

export async function topEarnersHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<TopListQuery>(res, "query");
    sendSuccess(res, await getTopEarners(q), "Top earners retrieved");
  } catch (err) { next(err); }
}

export async function topSponsorsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<TopListQuery>(res, "query");
    sendSuccess(res, await getTopSponsors(q), "Top sponsors retrieved");
  } catch (err) { next(err); }
}

export async function rankDistributionHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await getRankDistribution(), "Rank distribution retrieved");
  } catch (err) { next(err); }
}

export async function networkDistributionHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = getParsed<DateRangeQuery>(res, "query");
    sendSuccess(res, await getNetworkDistribution(q), "Network distribution retrieved");
  } catch (err) { next(err); }
}

export async function pendingOperationsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await getPendingOperations(), "Pending operations retrieved");
  } catch (err) { next(err); }
}

export async function riskReportHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await getRiskReport(), "Risk report retrieved");
  } catch (err) { next(err); }
}

export async function userIncomeSummaryHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const userId = String(req.params["id"] ?? "");
    sendSuccess(res, await getUserIncomeSummary(userId), "User income summary retrieved");
  } catch (err) { next(err); }
}
