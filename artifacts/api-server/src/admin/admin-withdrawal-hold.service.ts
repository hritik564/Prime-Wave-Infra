import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { logger } from "../lib/logger";

// ── Enable / disable withdrawal hold ─────────────────────────────────────────

export async function setWithdrawalHold(
  adminId: string,
  userId:  string,
  hold:    boolean,
  reason:  string,
) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true, withdrawalHold: true },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        withdrawalHold:       hold,
        withdrawalHoldReason: hold ? reason : null,
        withdrawalHoldBy:     hold ? adminId : null,
        withdrawalHoldAt:     hold ? now     : null,
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       hold ? "WITHDRAWAL_HOLD_ENABLED" : "WITHDRAWAL_HOLD_DISABLED",
        targetUserId: userId,
        details: {
          reason,
          toggledAt: now.toISOString(),
          holdState: hold,
        },
      },
    });
  });

  logger.info({ adminId, userId, hold, reason }, "admin: withdrawal hold toggled");

  return {
    userId,
    username:            user.username,
    withdrawalHold:      hold,
    withdrawalHoldReason: hold ? reason : null,
    withdrawalHoldBy:    hold ? adminId : null,
    withdrawalHoldAt:    hold ? now.toISOString() : null,
  };
}

// ── Get current hold status + audit history ───────────────────────────────────

export async function getWithdrawalHoldStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:                   true,
      username:             true,
      withdrawalHold:       true,
      withdrawalHoldReason: true,
      withdrawalHoldBy:     true,
      withdrawalHoldAt:     true,
    },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const auditHistory = await prisma.adminLog.findMany({
    where: {
      targetUserId: userId,
      action: { in: ["WITHDRAWAL_HOLD_ENABLED", "WITHDRAWAL_HOLD_DISABLED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id:        true,
      action:    true,
      createdAt: true,
      details:   true,
      admin: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });

  return { ...user, auditHistory };
}
