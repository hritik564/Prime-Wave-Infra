import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { RegisterInput, LoginInput, ChangePasswordInput } from "./auth.schema";
import type { AuthPayload } from "../shared/types";

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export async function registerUser(input: RegisterInput) {
  const { email, username, password, firstName, lastName, phone, referralCode } = input;

  const emailLower = email.toLowerCase();
  const usernameLower = username.toLowerCase();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: emailLower },
        { username: usernameLower },
        ...(phone ? [{ phone }] : []),
      ],
    },
  });

  if (existing) {
    if (existing.email === emailLower) {
      throw new AppError("Email already registered", HTTP_STATUS.CONFLICT, "EMAIL_TAKEN");
    }
    if (existing.username === usernameLower) {
      throw new AppError("Username already taken", HTTP_STATUS.CONFLICT, "USERNAME_TAKEN");
    }
    throw new AppError(
      "Phone number already registered",
      HTTP_STATUS.CONFLICT,
      "PHONE_TAKEN",
    );
  }

  let referredById: string | undefined;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode } });
    if (!referrer) {
      throw new AppError("Invalid referral code", HTTP_STATUS.BAD_REQUEST, "INVALID_REFERRAL");
    }
    referredById = referrer.id;
  }

  const rounds = parseInt(env.BCRYPT_ROUNDS, 10);
  const passwordHash = await bcrypt.hash(password, rounds);
  const userReferralCode = generateReferralCode();

  const user = await prisma.user.create({
    data: {
      email: emailLower,
      username: usernameLower,
      passwordHash,
      firstName,
      lastName,
      phone,
      referralCode: userReferralCode,
      referredBy: referredById,
      wallet: {
        create: {
          depositWallet: 0,
          incomeWallet: 0,
          withdrawalWallet: 0,
        },
      },
    },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      referralCode: true,
      status: true,
    },
  });

  const token = signToken({ sub: user.id, email: user.email, type: "user" });

  return { token, user };
}

export async function loginUser(input: LoginInput) {
  const { email, password } = input;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    // Use a generic message to prevent email enumeration
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  // BLOCKED users cannot log in under any circumstances
  if (user.status === "BLOCKED") {
    throw new AppError(
      "Your account has been blocked. Please contact support.",
      HTTP_STATUS.FORBIDDEN,
      "ACCOUNT_BLOCKED",
    );
  }

  // Verify password before revealing any other status info
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  // SUSPENDED and INACTIVE users CAN log in (restrictions enforced per-route)
  const token = signToken({ sub: user.id, email: user.email, type: "user" });

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

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, status: true },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  if (user.status === "BLOCKED") {
    throw new AppError(
      "Your account has been blocked",
      HTTP_STATUS.FORBIDDEN,
      "ACCOUNT_BLOCKED",
    );
  }

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AppError(
      "Current password is incorrect",
      HTTP_STATUS.BAD_REQUEST,
      "INVALID_CURRENT_PASSWORD",
    );
  }

  const rounds = parseInt(env.BCRYPT_ROUNDS, 10);
  const passwordHash = await bcrypt.hash(input.newPassword, rounds);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}
