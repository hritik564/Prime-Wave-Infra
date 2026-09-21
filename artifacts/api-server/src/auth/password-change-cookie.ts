import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env";

export const PASSWORD_CHANGE_COOKIE = "pw_password_change";
export const PASSWORD_CHANGE_CSRF_COOKIE = "pw_password_change_csrf";
export const PASSWORD_CHANGE_CSRF_HEADER = "X-Password-Change-CSRF";

const PASSWORD_CHANGE_COOKIE_MAX_AGE = 10 * 60 * 1000;
const PASSWORD_CHANGE_COOKIE_PATH = "/api/auth/change-password";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function hasMatchingCsrfToken(req: Request): boolean {
  const cookieToken = readCookie(req, PASSWORD_CHANGE_CSRF_COOKIE);
  const headerToken = req.get(PASSWORD_CHANGE_CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;

  const cookieBytes = Buffer.from(cookieToken);
  const headerBytes = Buffer.from(headerToken);
  return (
    cookieBytes.length === headerBytes.length
    && timingSafeEqual(cookieBytes, headerBytes)
  );
}

export function hasPasswordChangeCsrf(req: Request): boolean {
  return hasMatchingCsrfToken(req);
}

export function getPasswordChangeTokenFromCookie(req: Request): string | undefined {
  return readCookie(req, PASSWORD_CHANGE_COOKIE);
}

export function setPasswordChangeCookies(
  res: Response,
  resetToken: string,
  requestIsSecure = false,
): void {
  const csrfToken = randomBytes(32).toString("hex");
  const secure = requestIsSecure || env.NODE_ENV === "production";

  res.cookie(PASSWORD_CHANGE_COOKIE, resetToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    maxAge: PASSWORD_CHANGE_COOKIE_MAX_AGE,
    path: PASSWORD_CHANGE_COOKIE_PATH,
  });
  res.cookie(PASSWORD_CHANGE_CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    maxAge: PASSWORD_CHANGE_COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearPasswordChangeCookies(res: Response): void {
  res.clearCookie(PASSWORD_CHANGE_COOKIE, { path: PASSWORD_CHANGE_COOKIE_PATH });
  res.clearCookie(PASSWORD_CHANGE_CSRF_COOKIE, { path: "/" });
}