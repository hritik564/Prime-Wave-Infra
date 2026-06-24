import type { Request, Response, NextFunction } from "express";
import {
  createInvestment,
  listInvestments,
  getInvestmentById,
  claimPrincipal,
} from "./investments.service";
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
