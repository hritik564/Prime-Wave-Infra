import type { Request, Response, NextFunction } from "express";
import { loginAdmin, getAdminProfile } from "./admin.service";
import { sendSuccess } from "../shared/response";
import type { AdminLoginInput } from "./admin.schema";
import type { AuthenticatedRequest } from "../shared/types";

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

export async function adminGetProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const profile = await getAdminProfile(user.sub);
    sendSuccess(res, profile, "Profile fetched successfully");
  } catch (err) {
    next(err);
  }
}
