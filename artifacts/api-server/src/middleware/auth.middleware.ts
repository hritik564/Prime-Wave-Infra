import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "./error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AuthPayload, AuthenticatedRequest } from "../shared/types";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next(new AppError("Authentication token required", HTTP_STATUS.UNAUTHORIZED, "TOKEN_MISSING"));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    next(new AppError("Invalid or expired token", HTTP_STATUS.UNAUTHORIZED, "TOKEN_INVALID"));
  }
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
    next();
  });
}
