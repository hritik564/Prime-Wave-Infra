import type { Request, Response, NextFunction } from "express";
import {
  createInvestment,
  listInvestments,
  getInvestmentById,
  claimPrincipal,
  updateAutoCompound,
} from "./investments.service";
import { claimRoi, getEarnings } from "./roi.service";
import { getSinglePlanSummary } from "./single-plan.service";
import { sendSuccess, sendCreated } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import type { AuthenticatedRequest } from "../shared/types";
import type { CreateInvestmentInput, ListInvestmentsQuery } from "./investments.schema";

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const investment = await createInvestment(user.sub, req.body as CreateInvestmentInput);
    sendCreated(res, investment, "Investment created successfully");
  } catch (err) {
    next(err);
  }
}

export async function singlePlanSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    sendSuccess(res, await getSinglePlanSummary(user.sub), "Single-plan accounting");
  } catch (err) { next(err); }
}

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const query = getParsed<ListInvestmentsQuery>(res, "query");
    const result = await listInvestments(user.sub, query);
    sendSuccess(res, result, "Investments fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function getById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const investment = await getInvestmentById(user.sub, req.params.id as string);
    sendSuccess(res, investment, "Investment fetched successfully");
  } catch (err) {
    next(err);
  }
}

export async function claimPrincipalHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result = await claimPrincipal(user.sub, req.params.id as string);
    sendSuccess(res, result, "Principal claimed successfully");
  } catch (err) {
    next(err);
  }
}

export async function claimRoiHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result = await claimRoi(user.sub, req.params.id as string);
    sendSuccess(res, result, "ROI claimed successfully");
  } catch (err) {
    next(err);
  }
}

export async function toggleAutoCompoundHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const { autoCompound } = req.body as { autoCompound: boolean };
    const investment = await updateAutoCompound(user.sub, req.params.id as string, autoCompound);
    sendSuccess(res, investment, "Auto-compound setting updated");
  } catch (err) {
    next(err);
  }
}

export async function getEarningsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result = await getEarnings(user.sub, req.params.id as string);
    sendSuccess(res, result, "Earnings fetched successfully");
  } catch (err) {
    next(err);
  }
}
