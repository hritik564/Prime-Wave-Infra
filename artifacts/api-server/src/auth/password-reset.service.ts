import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { ForgotPasswordInput, ResetPasswordInput } from "./auth.schema";
import { signUserToken } from "./auth-token";
import {
  buildPasswordResetUrl,
  deliverPasswordResetToken,
  type PasswordResetDelivery,
} from "./password-reset-delivery.service";

export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60_000;

const GENERIC_RESET_MESSAGE =
  "If an account matches the supplied identifier, reset instructions will be sent.";

function hashResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface PasswordResetRequest {
  userId: string;
  email: string;
  username: string;
  expiresAt: Date;
  deliveryFailed: boolean;
}

export async function createPasswordResetRequest(
  input: ForgotPasswordInput,
  delivery: (payload: PasswordResetDelivery) => Promise<void> = deliverPasswordResetToken,
): Promise<PasswordResetRequest | null> {
  const identifier = input.identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier }],
    },
    select: { id: true, email: true, username: true },
  });

  if (!user) return null;

  const now = new Date();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt,
      },
    });
  });

  let deliveryFailed = false;
  try {
    await delivery({
      email: user.email,
      username: user.username,
      resetUrl: buildPasswordResetUrl(token),
      expiresAt,
    });
  } catch {
    // The caller receives only the generic response. The raw token is not
    // returned and the failure flag contains no user-controlled error text.
    deliveryFailed = true;
  }

  return {
    userId: user.id,
    email: user.email,
    username: user.username,
    expiresAt,
    deliveryFailed,
  };
}

export function genericPasswordResetMessage(): string {
  return GENERIC_RESET_MESSAGE;
}

export async function completePasswordReset(input: ResetPasswordInput) {
  const tokenHash = hashResetToken(input.token);
  const now = new Date();
  const tokenRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });

  if (
    !tokenRecord ||
    tokenRecord.usedAt !== null ||
    tokenRecord.expiresAt <= now
  ) {
    throw new AppError(
      "Reset token is invalid or expired",
      HTTP_STATUS.BAD_REQUEST,
      "RESET_TOKEN_INVALID",
    );
  }

  const passwordHash = await bcrypt.hash(
    input.newPassword,
    parseInt(env.BCRYPT_ROUNDS, 10),
  );

  const user = await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: tokenRecord.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (consumed.count !== 1) {
      throw new AppError(
        "Reset token is invalid or expired",
        HTTP_STATUS.BAD_REQUEST,
        "RESET_TOKEN_INVALID",
      );
    }

    return tx.user.update({
      where: { id: tokenRecord.userId },
      data: {
        passwordHash,
        passwordResetRequired: false,
        authVersion: { increment: 1 },
        passwordChangedAt: now,
        fullReplacementPasswordResetRunId: null,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        referralCode: true,
        status: true,
        authVersion: true,
      },
    });
  });

  const token = signUserToken({
    sub: user.id,
    email: user.email,
    type: "user",
    authVersion: user.authVersion,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      referralCode: user.referralCode,
      status: user.status,
    },
  };
}