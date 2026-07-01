import type { Request, Response, NextFunction } from "express";
import { runDepositAudit } from "./deposit-audit.service";
import { sendSuccess } from "../../shared/response";

export async function depositAuditHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const report = await runDepositAudit();
    sendSuccess(res, report, "Deposit audit complete");
  } catch (err) { next(err); }
}
