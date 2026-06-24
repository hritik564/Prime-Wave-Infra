import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { AppError } from "./error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AuthenticatedRequest } from "../shared/types";

/**
 * Blocks SUSPENDED or BLOCKED users from performing business actions
 * (investments, deposits, withdrawals, etc.).
 *
 * Must be used after requireAuth — relies on req.user being populated.
 * Fetches fresh status from DB so stale JWTs cannot bypass a status change.
 *
 * Usage:
 *   router.post("/invest", requireAuth, requireBusinessAccess, handler)
 */
export function requireBusinessAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const { user } = req as AuthenticatedRequest;

  prisma.user
    .findUnique({ where: { id: user.sub }, select: { status: true } })
    .then((found) => {
      if (!found) {
        next(new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND"));
        return;
      }

      if (found.status === "BLOCKED") {
        next(
          new AppError(
            "Your account has been blocked",
            HTTP_STATUS.FORBIDDEN,
            "ACCOUNT_BLOCKED",
          ),
        );
        return;
      }

      if (found.status === "SUSPENDED") {
        next(
          new AppError(
            "Your account is suspended. Business actions are not allowed.",
            HTTP_STATUS.FORBIDDEN,
            "ACCOUNT_SUSPENDED",
          ),
        );
        return;
      }

      next();
    })
    .catch(next);
}
