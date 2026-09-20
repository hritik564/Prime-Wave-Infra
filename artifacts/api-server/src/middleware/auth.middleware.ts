import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "./error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AuthPayload, AuthenticatedRequest } from "../shared/types";

function authenticateUser(
  req: Request,
  _res: Response,
  next: NextFunction,
  options: { allowPasswordReset?: boolean } = {},
): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new AppError("Authentication token required", HTTP_STATUS.UNAUTHORIZED, "TOKEN_MISSING"));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;

    // Admin authentication has its own middleware and must remain unchanged.
    // Only normal user JWTs are checked against the user auth epoch.
    if (payload.type !== "user") {
      (req as AuthenticatedRequest).user = payload;
      next();
      return;
    }

    void prisma.user.findUnique({
      where: { id: payload.sub },
      select: { authVersion: true, passwordResetRequired: true },
    }).then((user) => {
      if (!user) {
        next(new AppError("User session is no longer valid", HTTP_STATUS.UNAUTHORIZED, "USER_SESSION_INVALID"));
        return;
      }

      // Tokens issued before Stage 1 have no authVersion claim. Treat them as
      // version 0 so deploying the infrastructure does not log users out.
      const tokenVersion = payload.authVersion ?? 0;
      if (tokenVersion !== user.authVersion) {
        next(new AppError("User session is stale", HTTP_STATUS.UNAUTHORIZED, "USER_SESSION_STALE"));
        return;
      }

      if (user.passwordResetRequired && !options.allowPasswordReset) {
        next(new AppError(
          "Password reset required before normal access is restored",
          HTTP_STATUS.FORBIDDEN,
          "PASSWORD_RESET_REQUIRED",
        ));
        return;
      }

      (req as AuthenticatedRequest).user = payload;
      next();
    }).catch(() => {
      next(new AppError("Unable to validate user session", HTTP_STATUS.UNAUTHORIZED, "USER_SESSION_INVALID"));
    });
  } catch {
    next(new AppError("Invalid or expired token", HTTP_STATUS.UNAUTHORIZED, "TOKEN_INVALID"));
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  authenticateUser(req, res, next);
}

export function requireAuthAllowingPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  authenticateUser(req, res, next, { allowPasswordReset: true });
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    const authedReq = req as AuthenticatedRequest;
    if (authedReq.user.type !== "admin") {
      next(new AppError("Admin access required", HTTP_STATUS.FORBIDDEN, "FORBIDDEN"));
      return;
    }

    void prisma.admin.findUnique({
      where: { id: authedReq.user.sub },
      select: { isActive: true, role: true, updatedAt: true },
    }).then((admin) => {
      if (!admin) {
        next(new AppError("Admin session is no longer valid", HTTP_STATUS.UNAUTHORIZED, "ADMIN_SESSION_INVALID"));
        return;
      }
      if (!admin.isActive) {
        next(new AppError("Admin account is disabled", HTTP_STATUS.FORBIDDEN, "ACCOUNT_DISABLED"));
        return;
      }
      if (
        authedReq.user.adminUpdatedAt === undefined ||
        authedReq.user.adminUpdatedAt !== admin.updatedAt.getTime() ||
        authedReq.user.role !== admin.role
      ) {
        next(new AppError("Admin session is stale", HTTP_STATUS.UNAUTHORIZED, "ADMIN_SESSION_STALE"));
        return;
      }
      next();
    }).catch(() => {
      next(new AppError("Unable to validate admin session", HTTP_STATUS.UNAUTHORIZED, "ADMIN_SESSION_INVALID"));
    });
  });
}

/**
 * Role-restricted admin middleware factory.
 *
 * Usage: requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN")
 *
 * Ensures the request carries a valid admin JWT AND the admin's role
 * is in the provided allow-list.
 */
export function requireAdminRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAdminAuth(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      const authedReq = req as AuthenticatedRequest;
      if (!roles.includes(authedReq.user.role ?? "")) {
        next(new AppError("Insufficient admin role", HTTP_STATUS.FORBIDDEN, "FORBIDDEN"));
        return;
      }
      next();
    });
  };
}

/**
 * Temporary, feature-scoped access for Staff Operations.
 *
 * Keep these allow-lists centralized so the temporary expansion can be
 * removed without changing the broader finance or super-admin guards.
 */
export type TemporaryStaffOperationsFeature = "MANUAL_DEPOSIT" | "POWER_BUSINESS";

export function requireTemporaryStaffOperationsAccess(feature: TemporaryStaffOperationsFeature) {
  if (feature === "MANUAL_DEPOSIT") {
    return requireAdminRoles("SUPER_ADMIN", "FINANCE_ADMIN", "STAFF_OPERATIONS");
  }

  return requireAdminRoles("SUPER_ADMIN", "STAFF_OPERATIONS");
}

/**
 * /wallets/credit is shared by three wallet-credit actions. Staff may use
 * that existing endpoint only for the deposit-wallet path; income and
 * withdrawal credits remain finance-admin operations.
 */
export function requireTemporaryManualDepositWalletScope(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authedReq = req as AuthenticatedRequest;
  if (
    authedReq.user.role === "STAFF_OPERATIONS"
    && req.body?.walletType !== "depositWallet"
  ) {
    next(new AppError(
      "Staff Operations may only credit the deposit wallet",
      HTTP_STATUS.FORBIDDEN,
      "FORBIDDEN",
    ));
    return;
  }

  next();
}
