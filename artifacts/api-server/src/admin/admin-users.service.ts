import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { UserSearchQuery } from "./admin-dashboard.schema";
import { notificationService } from "../notifications/notifications.service";
import { computeOperationalStatus } from "../eligibility/eligibility.service";
import { logger } from "../lib/logger";

// ── User search ───────────────────────────────────────────────────────────────

const userListSelect = {
  id:                 true,
  username:           true,
  email:              true,
  phone:              true,
  firstName:          true,
  lastName:           true,
  status:             true,
  referralCode:       true,
  directReferralCount: true,
  directLeftCount:    true,
  directRightCount:   true,
  createdAt:          true,
  wallet: {
    select: {
      depositWallet:          true,
      incomeWallet:           true,
      withdrawalWallet:       true,
      lockedWithdrawalBalance: true,
    },
  },
  investments: {
    where:  { status: "ACTIVE" as const },
    select: { id: true },
    take:   1,
  },
} as const;

export async function searchUsers(query: UserSearchQuery) {
  const { username, email, phone, referralCode, status, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    ...(status && { status }),
    ...(username     && { username:     { contains: username,     mode: "insensitive" } }),
    ...(email        && { email:        { contains: email,        mode: "insensitive" } }),
    ...(phone        && { phone:        { contains: phone } }),
    ...(referralCode && { referralCode: { contains: referralCode, mode: "insensitive" } }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  userListSelect,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records.map((r) => ({
      ...r,
      operationalStatus: computeOperationalStatus({
        hasActiveInvestment: r.investments.length > 0,
        directLeftCount:     r.directLeftCount,
        directRightCount:    r.directRightCount,
      }),
    })),
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── User detail ───────────────────────────────────────────────────────────────

export async function getAdminUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:                   true,
      username:             true,
      email:                true,
      phone:                true,
      firstName:            true,
      lastName:             true,
      status:               true,
      referralCode:         true,
      directReferralCount:  true,
      position:             true,
      leftBV:               true,
      rightBV:              true,
      walletAddress:        true,
      telegramId:           true,
      createdAt:            true,
      updatedAt:            true,
      withdrawalHold:       true,
      withdrawalHoldReason: true,
      withdrawalHoldBy:     true,
      withdrawalHoldAt:     true,

      // Wallet
      wallet: {
        select: {
          depositWallet:          true,
          incomeWallet:           true,
          withdrawalWallet:       true,
          lockedWithdrawalBalance: true,
          updatedAt:              true,
        },
      },

      // Sponsor
      sponsor: {
        select: { id: true, username: true, email: true, firstName: true, lastName: true },
      },

      // Direct referrals (up to 20)
      directReferrals: {
        take:    20,
        orderBy: { createdAt: "asc" },
        select:  { id: true, username: true, email: true, createdAt: true, status: true },
      },

      // Binary parent
      binaryParent: {
        select: { id: true, username: true, position: true },
      },

      // Investments (most recent 10)
      investments: {
        take:    10,
        orderBy: { createdAt: "desc" },
        select: {
          id:            true,
          planType:      true,
          amount:        true,
          status:        true,
          dailyROI:      true,
          claimableROI:  true,
          startedAt:     true,
          maturesAt:     true,
          completedAt:   true,
          createdAt:     true,
        },
      },

      // Deposit history (most recent 10)
      depositRequests: {
        take:    10,
        orderBy: { createdAt: "desc" },
        select: {
          id:        true,
          amount:    true,
          network:   true,
          status:    true,
          txHash:    true,
          approvedAt: true,
          createdAt: true,
        },
      },

      // Withdrawal history (most recent 10)
      withdrawalRequests: {
        take:    10,
        orderBy: { createdAt: "desc" },
        select: {
          id:                    true,
          amount:                true,
          network:               true,
          status:                true,
          walletAddressSnapshot: true,
          txHash:                true,
          approvedAt:            true,
          completedAt:           true,
          rejectedReason:        true,
          createdAt:             true,
        },
      },

      // Salary achievements
      salaryAchievements: {
        orderBy: { achievedAt: "desc" },
        select: {
          rankName:     true,
          monthlyAmount: true,
          achievedAt:   true,
          expiresAt:    true,
          isActive:     true,
        },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  return user;
}

// ── User status controls ──────────────────────────────────────────────────────

type StatusAction = "block" | "suspend" | "activate";

const statusMap: Record<StatusAction, "BLOCKED" | "SUSPENDED" | "ACTIVE"> = {
  block:    "BLOCKED",
  suspend:  "SUSPENDED",
  activate: "ACTIVE",
};

const logActionMap: Record<StatusAction, string> = {
  block:    "USER_BLOCKED",
  suspend:  "USER_SUSPENDED",
  activate: "USER_ACTIVATED",
};

export async function setUserStatus(
  adminId: string,
  userId:  string,
  action:  StatusAction,
) {
  const targetStatus = statusMap[action];

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true, status: true },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  if (user.status === targetStatus) {
    throw new AppError(
      `User is already ${targetStatus.toLowerCase()}`,
      HTTP_STATUS.CONFLICT,
      "USER_STATUS_UNCHANGED",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data:  { status: targetStatus },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       logActionMap[action],
        targetUserId: userId,
        details: {
          previousStatus: user.status,
          newStatus:      targetStatus,
          username:       user.username,
        },
      },
    });
  });

  if (action === "block") {
    void notificationService.create({
      userId,
      type:    "ACCOUNT_BLOCKED",
      title:   "Account Blocked",
      message: "Your account has been blocked. Please contact support for assistance.",
      metadata: { previousStatus: user.status },
    });
  } else if (action === "suspend") {
    void notificationService.create({
      userId,
      type:    "ACCOUNT_SUSPENDED",
      title:   "Account Suspended",
      message: "Your account has been temporarily suspended. Please contact support for assistance.",
      metadata: { previousStatus: user.status },
    });
  }

  return { userId, username: user.username, previousStatus: user.status, newStatus: targetStatus };
}

// ── User profile edit (admin) ─────────────────────────────────────────────────

export const adminUpdateUserSchema = {
  username:  { type: "string", optional: true },
  email:     { type: "string", optional: true },
  phone:     { type: "string", optional: true },
  firstName: { type: "string", optional: true },
  lastName:  { type: "string", optional: true },
} as const;

export interface AdminUpdateUserInput {
  username?:  string;
  email?:     string;
  phone?:     string;
  firstName?: string;
  lastName?:  string;
}

export async function adminUpdateUser(
  adminId: string,
  userId:  string,
  data:    AdminUpdateUserInput,
) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true, email: true, phone: true, firstName: true, lastName: true },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const normalizedUsername = data.username !== undefined ? data.username.trim().toLowerCase() : undefined;
  const normalizedEmail    = data.email    !== undefined ? data.email.trim().toLowerCase()    : undefined;
  const normalizedPhone    = data.phone    !== undefined ? data.phone.trim()                   : undefined;
  const normalizedFirst    = data.firstName !== undefined ? data.firstName.trim()              : undefined;
  const normalizedLast     = data.lastName  !== undefined ? data.lastName.trim()               : undefined;

  if (normalizedUsername !== undefined && !normalizedUsername) {
    throw new AppError("Username cannot be empty", HTTP_STATUS.BAD_REQUEST, "INVALID_USERNAME");
  }
  if (normalizedEmail !== undefined && !normalizedEmail) {
    throw new AppError("Email cannot be empty", HTTP_STATUS.BAD_REQUEST, "INVALID_EMAIL");
  }

  if (normalizedUsername !== undefined && normalizedUsername !== user.username) {
    const conflict = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (conflict) throw new AppError("Username already taken", HTTP_STATUS.CONFLICT, "USERNAME_TAKEN");
  }

  if (normalizedEmail !== undefined && normalizedEmail !== user.email) {
    const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (conflict) throw new AppError("Email already in use", HTTP_STATUS.CONFLICT, "EMAIL_TAKEN");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id: userId },
      data: {
        ...(normalizedUsername !== undefined && { username:  normalizedUsername }),
        ...(normalizedEmail    !== undefined && { email:     normalizedEmail    }),
        ...(normalizedPhone    !== undefined && { phone:     normalizedPhone    }),
        ...(normalizedFirst    !== undefined && { firstName: normalizedFirst    }),
        ...(normalizedLast     !== undefined && { lastName:  normalizedLast     }),
      },
      select: { id: true, username: true, email: true, phone: true, firstName: true, lastName: true },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "USER_PROFILE_UPDATED",
        targetUserId: userId,
        details: {
          before: { username: user.username, email: user.email, phone: user.phone, firstName: user.firstName, lastName: user.lastName },
          after:  { username: result.username, email: result.email, phone: result.phone, firstName: result.firstName, lastName: result.lastName },
        },
      },
    });

    return result;
  });

  return updated;
}

// ── Withdrawal wallet update (SUPER_ADMIN + STAFF_OPERATIONS) ─────────────────

export async function adminUpdateUserWallet(
  adminId:   string,
  userId:    string,
  newWallet: string,
  reason:    string,
  ipAddress: string | null,
) {
  const [admin, user] = await Promise.all([
    prisma.admin.findUnique({
      where:  { id: adminId },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, username: true, walletAddress: true },
    }),
  ]);

  if (!admin) throw new AppError("Admin not found", HTTP_STATUS.NOT_FOUND, "ADMIN_NOT_FOUND");
  if (!user)  throw new AppError("User not found",  HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");

  const adminUsername  = `${admin.firstName} ${admin.lastName}`.trim() || admin.email;
  const trimmedWallet  = newWallet.trim();
  const previousWallet = user.walletAddress ?? null;

  if (!trimmedWallet) {
    throw new AppError("New wallet address is required", HTTP_STATUS.BAD_REQUEST, "INVALID_WALLET");
  }
  if (trimmedWallet === previousWallet) {
    throw new AppError(
      "New wallet address is identical to the current address",
      HTTP_STATUS.CONFLICT,
      "WALLET_UNCHANGED",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data:  { walletAddress: trimmedWallet },
    });

    await tx.walletAddress.deleteMany({ where: { userId } });

    await tx.walletAddress.create({
      data: {
        userId,
        address:    trimmedWallet,
        network:    "BEP20",
        label:      "Updated by Admin",
        isPrimary:  true,
        isVerified: true,
      },
    });

    await tx.walletChangeAuditLog.create({
      data: {
        adminId,
        adminUsername,
        userId,
        userUsername:  user.username,
        previousWallet,
        newWallet:     trimmedWallet,
        reason:        reason.trim(),
        ipAddress,
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "USER_WALLET_UPDATED",
        targetUserId: userId,
        details: {
          previousWallet,
          newWallet: trimmedWallet,
          reason:    reason.trim(),
          username:  user.username,
        },
      },
    });
  });

  logger.warn(
    { adminId, adminUsername, userId, userUsername: user.username, previousWallet, newWallet: trimmedWallet },
    "wallet.admin.change: withdrawal wallet updated by admin",
  );

  return { userId, username: user.username, previousWallet, newWallet: trimmedWallet };
}

// ── Delete user ───────────────────────────────────────────────────────────────

export async function deleteUser(adminId: string, userId: string): Promise<{ id: string; username: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id:                  true,
      username:            true,
      directReferralCount: true,
      _count: {
        select: {
          binaryChildren:    true,
          investments:       true,
          transactions:      true,
          depositRequests:   true,
          withdrawalRequests: true,
        },
      },
    },
  });

  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);

  const blocking: string[] = [];
  if (user.directReferralCount > 0)          blocking.push(`${user.directReferralCount} direct referral(s)`);
  if (user._count.binaryChildren > 0)        blocking.push(`${user._count.binaryChildren} binary child(ren)`);
  if (user._count.investments > 0)           blocking.push(`${user._count.investments} investment(s)`);
  if (user._count.transactions > 0)          blocking.push(`${user._count.transactions} wallet transaction(s)`);
  if (user._count.depositRequests > 0)       blocking.push(`${user._count.depositRequests} deposit request(s)`);
  if (user._count.withdrawalRequests > 0)    blocking.push(`${user._count.withdrawalRequests} withdrawal request(s)`);

  if (blocking.length > 0) {
    throw new AppError(
      `Cannot delete @${user.username}: has ${blocking.join(", ")}. Reassign or remove these records first.`,
      HTTP_STATUS.CONFLICT,
    );
  }

  await prisma.$transaction(async (tx) => {
    // ReferralHistory uses onDelete: Restrict on both sides — delete manually first
    await tx.referralHistory.deleteMany({ where: { userId } });
    // User delete cascades: Wallet, WalletAddress, Notification, SalaryBusinessSummary, PowerBvLedger
    await tx.user.delete({ where: { id: userId } });
  });

  logger.info({ adminId, deletedUserId: userId, username: user.username }, "Admin permanently deleted user");
  return { id: userId, username: user.username };
}

export async function getWalletAuditLogs(userId: string) {
  return prisma.walletChangeAuditLog.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
  });
}

// ── Password reset (admin) ────────────────────────────────────────────────────

export async function adminResetUserPassword(
  adminId:  string,
  userId:   string,
  newPassword: string,
) {
  const bcrypt = await import("bcryptjs");

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetRequired: false,
        authVersion: { increment: 1 },
        passwordChangedAt: new Date(),
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "USER_PASSWORD_RESET",
        targetUserId: userId,
        details:      { username: user.username, resetBy: adminId },
      },
    });
  });

  return { userId, username: user.username };
}
