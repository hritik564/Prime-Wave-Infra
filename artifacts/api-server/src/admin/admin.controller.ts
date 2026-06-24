import type { Request, Response, NextFunction } from "express";
import { loginAdmin } from "./admin.service";
import { sendSuccess } from "../shared/response";
import type { AdminLoginInput } from "./admin.schema";

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
