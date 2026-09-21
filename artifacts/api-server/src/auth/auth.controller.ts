import type { Request, Response, NextFunction } from "express";
import {
  registerUser,
  loginUser,
  changePassword,
  endImpersonation,
  PasswordResetRequiredError,
} from "./auth.service";
import {
  clearPasswordChangeCookies,
  setPasswordChangeCookies,
} from "./password-change-cookie";
import {
  completePasswordReset,
  createPasswordResetRequest,
  genericPasswordResetMessage,
} from "./password-reset.service";
import { logger } from "../lib/logger";
import { sendCreated, sendSuccess } from "../shared/response";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from "./auth.schema";
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
    if (err instanceof PasswordResetRequiredError) {
      setPasswordChangeCookies(res, err.resetToken, req.secure);
      next(new AppError(err.message, err.statusCode, err.code));
      return;
    }
    next(err);
  }
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const request = await createPasswordResetRequest(req.body as ForgotPasswordInput);

    if (request?.deliveryFailed) {
      // Never include the token, password, or adapter error in logs. The
      // generic response prevents account enumeration while delivery is
      // unavailable or being configured.
      logger.warn(
        { userId: request.userId, deliveryFailed: true },
        "password-reset delivery unavailable",
      );
    }

    sendSuccess(res, null, genericPasswordResetMessage());
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await completePasswordReset(req.body as ResetPasswordInput);
    sendSuccess(res, result, "Password reset successfully");
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
    const result = await changePassword(
      user.sub,
      req.body as ChangePasswordInput,
      {
        restricted: user.type === "password_reset",
        authVersion: user.authVersion,
      },
    );
    clearPasswordChangeCookies(res);
    sendSuccess(res, result, "Password changed successfully");
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  // JWT is stateless — the client must discard the token.
  // For production, pair this with a token blacklist (Redis) if needed.
  sendSuccess(res, null, "Logged out successfully");
}

export async function exitImpersonation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    if (!user.impersonated || !user.sessionId || !user.originalAdminId) {
      throw new AppError("Not an impersonation session", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");
    }
    await endImpersonation(user.sessionId, user.originalAdminId);
    sendSuccess(res, null, "Impersonation session ended");
  } catch (err) {
    next(err);
  }
}
