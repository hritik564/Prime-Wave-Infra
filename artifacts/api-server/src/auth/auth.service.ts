import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { RegisterInput, LoginInput, ChangePasswordInput } from "./auth.schema";
import type { AuthPayload } from "../shared/types";
import { notificationService } from "../notifications/notifications.service";
import { placeUserTx } from "../binary/binary.service";

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Parse the referral code and leg from the registration input.
 *
 * Supports two formats:
 *   • Explicit: referralCode="ABCD1234", leg="L"
 *   • Suffix:   referralCode="ABCD1234-L" (leg in code overrides explicit leg)
 *
 * Returns { baseCode, position } where position is the Prisma enum value.
 */
function parseReferral(referralCode: string, leg: "L" | "R"): { baseCode: string; position: "LEFT" | "RIGHT" } {
  let baseCode = referralCode.trim().toUpperCase();
  let resolvedLeg = leg;

  if (baseCode.endsWith("-L")) {
    baseCode = baseCode.slice(0, -2);
    resolvedLeg = "L";
  } else if (baseCode.endsWith("-R")) {
    baseCode = baseCode.slice(0, -2);
    resolvedLeg = "R";
  }

  const position: "LEFT" | "RIGHT" = resolvedLeg === "L" ? "LEFT" : "RIGHT";
  return { baseCode, position };
}

export async function registerUser(input: RegisterInput) {
  const { email, username, password, firstName, lastName, phone, referralCode: rawCode, leg } = input;

  const emailLower    = email.toLowerCase();
  const usernameLower = username.toLowerCase();

  // Parse leg from code (supports both explicit leg and ABCD1234-L suffix format)
  const { baseCode, position } = parseReferral(rawCode, leg);

  // ── Duplicate check (outside tx — CPU work follows, tx held open minimally) ──
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: emailLower },
        { username: usernameLower },
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { email: true, username: true, phone: true },
  });

  if (existing) {
    if (existing.email === emailLower)
      throw new AppError("Email already registered", HTTP_STATUS.CONFLICT, "EMAIL_TAKEN");
    if (existing.username === usernameLower)
      throw new AppError("Username already taken", HTTP_STATUS.CONFLICT, "USERNAME_TAKEN");
    throw new AppError("Phone number already registered", HTTP_STATUS.CONFLICT, "PHONE_TAKEN");
  }

  // ── Password hash outside the transaction (CPU-intensive, must not block DB) ──
  const rounds       = parseInt(env.BCRYPT_ROUNDS, 10);
  const passwordHash = await bcrypt.hash(password, rounds);
  const userReferralCode = generateReferralCode();

  // ── Atomic: validate sponsor + create user + update sponsor + history + place ─
  const user = await prisma.$transaction(async (tx) => {
    // Resolve referral code — required for all registrations
    const sponsor = await tx.user.findUnique({
      where:  { referralCode: baseCode },
      select: { id: true },
    });
    if (!sponsor) {
      throw new AppError("Invalid referral code", HTTP_STATUS.BAD_REQUEST, "INVALID_REFERRAL");
    }
    const sponsorId = sponsor.id;

    // Create the new user (wallet nested)
    const newUser = await tx.user.create({
      data: {
        email:        emailLower,
        username:     usernameLower,
        passwordHash,
        firstName,
        lastName,
        phone,
        referralCode: userReferralCode,
        referredBy:   sponsorId,
        sponsorId,
        wallet: {
          create: {
            depositWallet:    0,
            incomeWallet:     0,
            withdrawalWallet: 0,
          },
        },
      },
      select: {
        id:           true,
        email:        true,
        username:     true,
        firstName:    true,
        lastName:     true,
        referralCode: true,
        status:       true,
      },
    });

    // Increment sponsor's directReferralCount and leg-specific count atomically
    await tx.user.update({
      where: { id: sponsorId },
      data: {
        directReferralCount: { increment: 1 },
        ...(position === "LEFT"
          ? { directLeftCount: { increment: 1 } }
          : { directRightCount: { increment: 1 } }),
      },
    });

    // Create permanent referral history record — includes placement leg for audit
    await tx.referralHistory.create({
      data: { sponsorId, userId: newUser.id, leg: position },
    });

    // Auto-place user in the binary tree using the leg from the referral link/code
    await placeUserTx(tx, sponsorId, newUser.id, position);

    return newUser;
  });

  const token = signToken({ sub: user.id, email: user.email, type: "user" });

  return { token, user };
}

export async function loginUser(input: LoginInput) {
  const { identifier, password } = input;
  const id = identifier.trim().toLowerCase();

  // Support login by email OR username
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: id },
        { username: id },
      ],
    },
  });

  if (!user) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  if (user.status === "BLOCKED") {
    throw new AppError(
      "Your account has been blocked. Please contact support.",
      HTTP_STATUS.FORBIDDEN,
      "ACCOUNT_BLOCKED",
    );
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  const token = signToken({ sub: user.id, email: user.email, type: "user" });

  return {
    token,
    user: {
      id:           user.id,
      email:        user.email,
      username:     user.username,
      firstName:    user.firstName,
      lastName:     user.lastName,
      referralCode: user.referralCode,
      status:       user.status,
    },
  };
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, passwordHash: true, status: true },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  if (user.status === "BLOCKED") {
    throw new AppError("Your account has been blocked", HTTP_STATUS.FORBIDDEN, "ACCOUNT_BLOCKED");
  }

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AppError(
      "Current password is incorrect",
      HTTP_STATUS.BAD_REQUEST,
      "INVALID_CURRENT_PASSWORD",
    );
  }

  const rounds       = parseInt(env.BCRYPT_ROUNDS, 10);
  const passwordHash = await bcrypt.hash(input.newPassword, rounds);

  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  void notificationService.create({
    userId,
    type:    "PASSWORD_CHANGED",
    title:   "Password Changed",
    message: "Your account password has been changed successfully. If you did not make this change, contact support immediately.",
  });
}
