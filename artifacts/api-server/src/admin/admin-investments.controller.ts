import { type Request, type Response, type NextFunction } from "express";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import { adminListInvestments, adminGetInvestment } from "./admin-investments.service";
import type { AdminInvestmentListQuery } from "./admin-investments.schema";

export async function listAdminInvestmentsHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const query  = getParsed<AdminInvestmentListQuery>(res, "query");
    const result = await adminListInvestments(query);
    sendSuccess(res, result, "Investments retrieved");
  } catch (err) { next(err); }
}

export async function getAdminInvestmentHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const id     = String(req.params["id"] ?? "");
    const result = await adminGetInvestment(id);
    sendSuccess(res, result, "Investment retrieved");
  } catch (err) { next(err); }
}
