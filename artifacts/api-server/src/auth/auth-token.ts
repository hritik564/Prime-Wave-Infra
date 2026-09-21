import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthPayload } from "../shared/types";

export function signUserToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

const PASSWORD_CHANGE_TOKEN_TTL = "10m" as const;

export function signPasswordChangeToken(payload: Pick<AuthPayload, "sub" | "email" | "authVersion">): string {
  return jwt.sign(
    {
      ...payload,
      type: "password_reset",
      purpose: "password_change",
    },
    env.JWT_SECRET,
    { expiresIn: PASSWORD_CHANGE_TOKEN_TTL },
  );
}