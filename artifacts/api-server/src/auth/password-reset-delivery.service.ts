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
  token: string;
  expiresAt: Date;
}

export async function deliverPasswordResetToken(
  _delivery: PasswordResetDelivery,
): Promise<void> {
  throw new Error("Password reset delivery is not configured");
}