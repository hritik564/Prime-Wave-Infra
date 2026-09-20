import { env } from "../config/env";

/**
 * Trusted password-reset delivery boundary.
 *
 * This project does not currently contain an email/SMS transport. The
 * production adapter must be provided before the mass cutover. Keeping this
 * boundary explicit prevents the reset token from being returned in an API
 * response or written to logs as a temporary fallback.
 */
export interface PasswordResetDelivery {
  email: string;
  username: string;
  resetUrl: string;
  expiresAt: Date;
}

/**
 * Builds the only reset URL shape accepted by the delivery boundary:
 *   <configured trusted base>/reset-password?token=<raw-token>
 *
 * PASSWORD_RESET_BASE_URL is deployment configuration, not request input.
 * In production it must be an HTTPS URL for the approved application domain.
 */
export function buildPasswordResetUrl(token: string): string {
  const configuredBase = env.PASSWORD_RESET_BASE_URL;
  if (!configuredBase) {
    throw new Error("Password reset trusted domain is not configured");
  }

  const base = new URL(configuredBase);
  if (env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new Error("Password reset trusted domain must use HTTPS");
  }
  if (base.search || base.hash) {
    throw new Error("Password reset trusted domain must not contain query or hash parameters");
  }

  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const resetUrl = new URL("reset-password", `${base.origin}${basePath}`);
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}

export async function deliverPasswordResetToken(
  _delivery: PasswordResetDelivery,
): Promise<void> {
  throw new Error("Password reset delivery is not configured");
}