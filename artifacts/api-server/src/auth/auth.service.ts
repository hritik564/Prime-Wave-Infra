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
import { signPasswordChangeToken, signUserToken } from "./auth-token";

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export const signToken = signUserToken;

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
  const { email, username, password, firstName, lastName, phone, referralCode: rawCode, leg, walletAddress } = input;

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
        authVersion:  true,
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

    // Save BEP20 withdrawal wallet address if provided at registration
    if (walletAddress) {
      await tx.walletAddress.create({
        data: {
          userId:    newUser.id,
          network:   "BEP20",
          address:   walletAddress,
          isPrimary: true,
        },
      });
    }

    return newUser;
  }, { timeout: 30_000 });

  const { authVersion, ...publicUser } = user;
  const token = signToken({
    sub: user.id,
    email: user.email,
    type: "user",
    authVersion,
  });

  return { token, user: publicUser };
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

  if (user.passwordResetRequired) {
    const resetToken = signPasswordChangeToken({
      sub: user.id,
      email: user.email,
      authVersion: user.authVersion,
    });
    throw new AppError(
      "Password reset required before normal access is restored",
      HTTP_STATUS.FORBIDDEN,
      "PASSWORD_RESET_REQUIRED",
      { resetToken },
    );
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    type: "user",
    authVersion: user.authVersion,
  });

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

// ── Impersonation ─────────────────────────────────────────────────────────────

function signImpersonationToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "2h" });
}

export async function startImpersonation(
  adminId:    string,
  targetUserId: string,
  ip:         string,
  userAgent:  string,
  reason?:    string,
): Promise<{ token: string; sessionId: string; user: { id: string; email: string; username: string; firstName: string; lastName: string } }> {
  // Verify the admin has an impersonation-capable staff role
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true, role: true } });
  if (!admin) throw new AppError("Admin not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
  if (admin.role !== "SUPER_ADMIN" && admin.role !== "STAFF_OPERATIONS") {
    throw new AppError("Only SUPER_ADMIN or STAFF_OPERATIONS may impersonate users", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }

  // Get target user
  const target = await prisma.user.findUnique({
    where:  { id: targetUserId },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      authVersion: true,
    },
  });
  if (!target) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");

  // Create session + audit log atomically
  const session = await prisma.$transaction(async (tx) => {
    const sess = await tx.impersonationSession.create({
      data: { adminId, targetUserId, ip, userAgent, reason: reason ?? null },
    });
    await tx.adminLog.create({
      data: {
        adminId,
        action:       "ADMIN_IMPERSONATION_STARTED",
        targetUserId,
        details:      { sessionId: sess.id, ip, userAgent, reason: reason ?? null },
      },
    });
    return sess;
  });

  const token = signImpersonationToken({
    sub:             target.id,
    email:           target.email,
    type:            "user",
    impersonated:    true,
    originalAdminId: adminId,
    sessionId:       session.id,
    authVersion:     target.authVersion,
  });

  return { token, sessionId: session.id, user: { id: target.id, email: target.email, username: target.username, firstName: target.firstName, lastName: target.lastName } };
}

export async function endImpersonation(sessionId: string, adminId: string): Promise<void> {
  const session = await prisma.impersonationSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError("Impersonation session not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
  if (session.endedAt) throw new AppError("Impersonation session already ended", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");
  if (session.adminId !== adminId) throw new AppError("Session belongs to a different admin", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");

  const now           = new Date();
  const durationSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);

  await prisma.$transaction(async (tx) => {
    await tx.impersonationSession.update({ where: { id: sessionId }, data: { endedAt: now } });
    await tx.adminLog.create({
      data: {
        adminId,
        action:       "ADMIN_IMPERSONATION_ENDED",
        targetUserId: session.targetUserId,
        details:      { sessionId, durationSeconds },
      },
    });
  });
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

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      passwordResetRequired: false,
      authVersion: { increment: 1 },
      passwordChangedAt: new Date(),
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

  void notificationService.create({
    userId,
    type:    "PASSWORD_CHANGED",
    title:   "Password Changed",
    message: "Your account password has been changed successfully. If you did not make this change, contact support immediately.",
  });

  return {
    token: signUserToken({
      sub: updatedUser.id,
      email: updatedUser.email,
      type: "user",
      authVersion: updatedUser.authVersion,
    }),
    user: updatedUser,
  };
}
