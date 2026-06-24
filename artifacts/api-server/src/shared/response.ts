import type { Response } from "express";
import { HTTP_STATUS } from "./constants";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Success",
  statusCode: number = HTTP_STATUS.OK,
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  } satisfies ApiResponse<T>);
}

export function sendCreated<T>(res: Response, data: T, message = "Created"): Response {
  return sendSuccess(res, data, message, HTTP_STATUS.CREATED);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  errors?: unknown,
): Response {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors !== undefined && { errors }),
  } satisfies ApiResponse);
}
