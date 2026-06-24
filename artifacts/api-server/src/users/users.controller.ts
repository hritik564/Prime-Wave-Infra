import type { Request, Response, NextFunction } from "express";
import { getUserProfile } from "./users.service";
import { sendSuccess } from "../shared/response";
import type { AuthenticatedRequest } from "../shared/types";

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const profile = await getUserProfile(user.sub);
    sendSuccess(res, profile, "Profile fetched successfully");
  } catch (err) {
    next(err);
  }
}
