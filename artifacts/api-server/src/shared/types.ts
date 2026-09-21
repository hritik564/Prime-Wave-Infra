import type { Request } from "express";

export interface AuthPayload {
  sub: string;
  email: string;
  type: "user" | "admin" | "password_reset";
  role?: string;
  /** User-only auth epoch; incrementing it invalidates prior user JWTs. */
  authVersion?: number;
  /** Present only on the short-lived password-change token. */
  purpose?: "password_change";
  /** Admin account updatedAt timestamp captured when the JWT was issued. */
  adminUpdatedAt?: number;
  /** Present only on impersonation tokens */
  impersonated?: true;
  originalAdminId?: string;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: AuthPayload;
}
