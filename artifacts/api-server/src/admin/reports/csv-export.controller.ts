import { type Request, type Response, type NextFunction } from "express";
import {
  exportUsersAsCsv,
  exportDepositsAsCsv,
  exportWithdrawalsAsCsv,
  exportSalaryIncomeAsCsv,
  exportBinaryIncomeAsCsv,
} from "./csv-export.service";

function sendCsv(res: Response, csv: string, filename: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(csv);
}

export async function exportUsersHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { csv, filename } = await exportUsersAsCsv();
    sendCsv(res, csv, filename);
  } catch (err) { next(err); }
}

export async function exportDepositsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { csv, filename } = await exportDepositsAsCsv();
    sendCsv(res, csv, filename);
  } catch (err) { next(err); }
}

export async function exportWithdrawalsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { csv, filename } = await exportWithdrawalsAsCsv();
    sendCsv(res, csv, filename);
  } catch (err) { next(err); }
}

export async function exportSalaryIncomeHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { csv, filename } = await exportSalaryIncomeAsCsv();
    sendCsv(res, csv, filename);
  } catch (err) { next(err); }
}

export async function exportBinaryIncomeHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { csv, filename } = await exportBinaryIncomeAsCsv();
    sendCsv(res, csv, filename);
  } catch (err) { next(err); }
}
