import type { Request, Response, NextFunction } from "express";
import { registerUser, loginUser, changePassword } from "./auth.service";
import { sendCreated, sendSuccess } from "../shared/response";
import type { RegisterInput, LoginInput, ChangePasswordInput } from "./auth.schema";
import type { AuthenticatedRequest } from "../shared/types";

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await registerUser(req.body as RegisterInput);
    sendCreated(res, result, "Registration successful");
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await loginUser(req.body as LoginInput);
    sendSuccess(res, result, "Login successful");
  } catch (err) {
    next(err);
  }
}

export async function changeUserPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    await changePassword(user.sub, req.body as ChangePasswordInput);
    sendSuccess(res, null, "Password changed successfully");
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  // JWT is stateless — the client must discard the token.
  // For production, pair this with a token blacklist (Redis) if needed.
  sendSuccess(res, null, "Logged out successfully");
}
