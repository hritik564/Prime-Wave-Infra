import type { Request, Response, NextFunction } from "express";
import { registerUser, loginUser } from "./auth.service";
import { sendCreated, sendSuccess } from "../shared/response";
import type { RegisterInput, LoginInput } from "./auth.schema";

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
