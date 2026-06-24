import type { Request, Response, NextFunction } from "express";
import { getLevelIncomeHistory, getLevelIncomeSummary } from "./level-income.service";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { LevelIncomeHistoryQuery, LevelIncomeSummaryQuery } from "./level-income.schema";

export async function getLevelIncomeHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<LevelIncomeHistoryQuery>(res, "query");
    const result   = await getLevelIncomeHistory(query.userId ?? user.sub, query);
    sendSuccess(res, result, "Level income history fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getLevelIncomeSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query    = getParsed<LevelIncomeSummaryQuery>(res, "query");
    const result   = await getLevelIncomeSummary(query.userId ?? user.sub);
    sendSuccess(res, result, "Level income summary fetched successfully");
  } catch (err) {
    next(err);
  }
}
