import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";
import { HTTP_STATUS } from "../shared/constants";

export class AppError extends Error {
  constructor(
    public override readonly message: string,
    public readonly statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    public readonly code?: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

type PrismaError = { code: string; meta?: Record<string, unknown> };

function isPrismaError(err: unknown): err is PrismaError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as PrismaError).code === "string"
  );
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      success: false,
      message: "Validation failed",
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code !== undefined && { code: err.code }),
      ...(err.data !== undefined && { data: err.data }),
    });
    return;
  }

  if (isPrismaError(err)) {
    if (err.code === "P2002") {
      res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: "A record with that value already exists",
        code: "DUPLICATE_ENTRY",
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: "Record not found",
        code: "NOT_FOUND",
      });
      return;
    }
  }

  logger.error({ err }, "Unhandled error");

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "An unexpected error occurred",
  });
}
