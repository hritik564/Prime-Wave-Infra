import { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminWalletListQuery, SaveWalletNotesInput } from "./admin-wallets.schema";

// ── Status mapping ────────────────────────────────────────────────────────────

const WALLET_STATUS_TO_USER: Record<string, UserStatus> = {
  ACTIVE:  "ACTIVE",
  LOCKED:  "INACTIVE",
  FROZEN:  "BLOCKED",
  FLAGGED: "SUSPENDED",
};

// ── Shared selects ────────────────────────────────────────────────────────────

const listUserSelect = {
  id:           true,
  username:     true,
  email:        true,
  firstName:    true,
  lastName:     true,
  status:       true,
  referralCode: true,
  sponsor:      { select: { username: true } },
  investments: {
    where:   { status: "ACTIVE" as const },
    orderBy: { createdAt: "desc" as const },
    take:    1,
    select:  { planType: true },
  },
  transactions: {
    orderBy: { createdAt: "desc" as const },
    take:    1,
    select:  { createdAt: true },
  },
} as const;

const listWalletSelect = {
  id:                     true,
  userId:                 true,
  depositWallet:          true,
  incomeWallet:           true,
  withdrawalWallet:       true,
  lockedWithdrawalBalance:true,
  updatedAt:              true,
  user: { select: listUserSelect },
} as const;

// ── List wallets ──────────────────────────────────────────────────────────────

export async function getAdminWallets(query: AdminWalletListQuery) {
  const { page, limit, search, status, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const userWhere: Prisma.UserWhereInput = {
    ...(status ? { status: WALLET_STATUS_TO_USER[status] } : {}),
    ...(search ? {
      OR: [
        { username:     { contains: search, mode: "insensitive" } },
        { email:        { contains: search, mode: "insensitive" } },
        { id:           { contains: search, mode: "insensitive" } },
        { referralCode: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const where: Prisma.WalletWhereInput = { user: userWhere };

  const orderBy: Prisma.WalletOrderByWithRelationInput =
    sortBy === "depositWallet"    ? { depositWallet:    sortOrder } :
    sortBy === "incomeWallet"     ? { incomeWallet:     sortOrder } :
    sortBy === "withdrawalWallet" ? { withdrawalWallet: sortOrder } :
    { updatedAt: sortOrder };

  const [wallets, total] = await prisma.$transaction([
    prisma.wallet.findMany({ where, orderBy, skip, take: limit, select: listWalletSelect }),
    prisma.wallet.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    wallets,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Stats (KPI cards) ─────────────────────────────────────────────────────────

export async function getAdminWalletStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [walletAgg, userStatusCounts, txsToday] = await Promise.all([
    prisma.wallet.aggregate({
      _sum:   { depositWallet: true, incomeWallet: true, withdrawalWallet: true, lockedWithdrawalBalance: true },
      _count: true,
    }),
    prisma.user.groupBy({ by: ["status"], _count: true }),
    prisma.walletTransaction.count({
      where: { type: "INCOME_TRANSFER", status: "SUCCESS", createdAt: { gte: todayStart } },
    }),
  ]);

  const dep    = walletAgg._sum.depositWallet?.toNumber()           ?? 0;
  const inc    = walletAgg._sum.incomeWallet?.toNumber()            ?? 0;
  const wit    = walletAgg._sum.withdrawalWallet?.toNumber()        ?? 0;
  const locked = walletAgg._sum.lockedWithdrawalBalance?.toNumber() ?? 0;
  const total  = dep + inc + wit;
  const count  = walletAgg._count;
  const avg    = count > 0 ? total / count : 0;

  const statusMap = Object.fromEntries(userStatusCounts.map(s => [s.status, s._count]));

  return {
    totalDepositWallet:      dep.toFixed(2),
    totalIncomeWallet:       inc.toFixed(2),
    totalWithdrawalWallet:   wit.toFixed(2),
    totalLockedBalance:      locked.toFixed(2),
    totalPlatformValue:      total.toFixed(2),
    avgWalletBalance:        avg.toFixed(2),
    totalWallets:            count,
    activeCount:             statusMap["ACTIVE"]    ?? 0,
    lockedCount:             statusMap["INACTIVE"]  ?? 0,
    frozenCount:             statusMap["BLOCKED"]   ?? 0,
    flaggedCount:            statusMap["SUSPENDED"] ?? 0,
    completedTransfersToday: txsToday,
  };
}

// ── Single wallet detail ──────────────────────────────────────────────────────

export async function getAdminWalletById(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where:  { userId },
    select: {
      id:                     true,
      userId:                 true,
      depositWallet:          true,
      incomeWallet:           true,
      withdrawalWallet:       true,
      lockedWithdrawalBalance:true,
      updatedAt:              true,
      user: {
        select: {
          id:           true,
          username:     true,
          email:        true,
          firstName:    true,
          lastName:     true,
          status:       true,
          referralCode: true,
          sponsor:      { select: { username: true } },
          investments: {
            where:   { status: "ACTIVE" },
            orderBy: { createdAt: "desc" },
            take:    1,
            select:  { planType: true },
          },
        },
      },
    },
  });

  if (!wallet) {
    throw new AppError("Wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }

  const [transactions, adminLogs, creditAgg, debitAgg] = await Promise.all([
    prisma.walletTransaction.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      take:    30,
      select: {
        id: true, type: true, status: true,
        amount: true, fee: true, netAmount: true,
        description: true, metadata: true, createdAt: true,
      },
    }),
    prisma.adminLog.findMany({
      where:   { targetUserId: userId },
      orderBy: { createdAt: "desc" },
      take:    50,
      select: {
        id: true, action: true, details: true, createdAt: true,
        admin: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId, status: "SUCCESS", type: { in: ["DEPOSIT", "ROI_CLAIM", "PRINCIPAL_RELEASE", "BINARY_MATCH", "BINARY_ORBIT", "LEVEL_INCOME", "SALARY"] } },
      _sum:  { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId, status: "SUCCESS", type: { in: ["INVESTMENT", "WITHDRAWAL", "INCOME_TRANSFER"] } },
      _sum:  { amount: true },
    }),
  ]);

  const noteLog     = adminLogs.find(l => l.action === "WALLET_NOTE");
  const adminNotes  = noteLog
    ? ((noteLog.details as Record<string, unknown> | null)?.["notes"] as string | undefined) ?? ""
    : "";
  const auditLogs   = adminLogs.filter(l => l.action !== "WALLET_NOTE");
  const lastTx      = transactions[0]?.createdAt ?? wallet.updatedAt;

  return {
    wallet,
    transactions,
    adminLogs: auditLogs,
    adminNotes,
    lastTx,
    lifetimeCredits: (creditAgg._sum.amount?.toNumber() ?? 0).toFixed(2),
    lifetimeDebits:  (debitAgg._sum.amount?.toNumber()  ?? 0).toFixed(2),
  };
}

// ── Save admin notes ──────────────────────────────────────────────────────────

export async function resetLockedBalance(
  adminId: string,
  userId:  string,
  reason:  string,
) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const wallet = await prisma.wallet.findUnique({
    where:  { userId },
    select: { id: true, lockedWithdrawalBalance: true },
  });
  if (!wallet) {
    throw new AppError("Wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }

  const previousValue = wallet.lockedWithdrawalBalance;

  await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { id: wallet.id },
      data:  { lockedWithdrawalBalance: new Prisma.Decimal(0) },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "WALLET_ADJUSTMENT",
        targetUserId: userId,
        details: {
          operation:     "reset_locked_balance",
          previousValue: previousValue.toString(),
          newValue:      "0",
          reason,
          username:      user.username,
        },
      },
    });
  });

  return {
    userId,
    username:      user.username,
    previousLockedBalance: previousValue,
    newLockedBalance:      0,
    reason,
  };
}

export async function saveWalletNotes(
  adminId: string,
  userId:  string,
  input:   SaveWalletNotesInput,
) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  await prisma.adminLog.create({
    data: {
      adminId,
      action:       "WALLET_NOTE",
      targetUserId: userId,
      details: {
        notes:     input.notes,
        username:  user.username,
        updatedBy: adminId,
      },
    },
  });

  return { userId, username: user.username, notes: input.notes };
}
