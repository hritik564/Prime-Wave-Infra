import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { UserSearchQuery } from "./admin-dashboard.schema";

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
  createdAt:          true,
  wallet: {
    select: {
      depositWallet:          true,
      incomeWallet:           true,
      withdrawalWallet:       true,
      lockedWithdrawalBalance: true,
    },
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
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── User detail ───────────────────────────────────────────────────────────────

export async function getAdminUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:                 true,
      username:           true,
      email:              true,
      phone:              true,
      firstName:          true,
      lastName:           true,
      status:             true,
      referralCode:       true,
      directReferralCount: true,
      position:           true,
      leftBV:             true,
      rightBV:            true,
      walletAddress:      true,
      telegramId:         true,
      createdAt:          true,
      updatedAt:          true,

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

  return { userId, username: user.username, previousStatus: user.status, newStatus: targetStatus };
}
