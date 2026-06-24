import type { Request } from "express";

export interface AuthPayload {
  sub: string;
  email: string;
  type: "user" | "admin";
  role?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: AuthPayload;
}
