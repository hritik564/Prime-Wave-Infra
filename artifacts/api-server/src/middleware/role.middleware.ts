import type { Request, Response, NextFunction } from "express";
import type { AdminRole } from "@prisma/client";
import { AppError } from "./error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AuthenticatedRequest } from "../shared/types";

/**
 * Restrict an admin route to one or more specific roles.
 *
 * Usage:
 *   router.get("/something", requireAdminAuth, requireRole("SUPER_ADMIN"), handler)
 *   router.get("/something", requireAdminAuth, requireRole(["SUPER_ADMIN", "FINANCE_ADMIN"]), handler)
 */
export function requireRole(roles: AdminRole | AdminRole[]) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req: Request, _res: Response, next: NextFunction): void => {
    const authedReq = req as AuthenticatedRequest;

    if (authedReq.user?.type !== "admin") {
      next(new AppError("Admin access required", HTTP_STATUS.FORBIDDEN, "FORBIDDEN"));
      return;
    }

    const userRole = authedReq.user.role as AdminRole | undefined;

    if (!userRole || !allowed.includes(userRole)) {
      next(
        new AppError(
          `This action requires one of: ${allowed.join(", ")}`,
          HTTP_STATUS.FORBIDDEN,
          "INSUFFICIENT_ROLE",
        ),
      );
      return;
    }

    next();
  };
}
