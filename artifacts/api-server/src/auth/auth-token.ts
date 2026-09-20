import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthPayload } from "../shared/types";

export function signUserToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}