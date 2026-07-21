import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middleware/error.middleware.js";
import { HTTP_STATUS } from "../shared/constants.js";
import type { PowerBvAddInput, PowerBvRemoveInput, PowerBvLedgerQuery } from "./power-bv.schema.js";
import { updatePowerBusiness } from "../salary/salary-business.service.js";

// ── Add Power BV ──────────────────────────────────────────────────────────────

/**
 * Credits Power BV to a single leg of the target user.
 *
 * Atomic:
 *   1. Lock user row (SELECT in same tx).
 *   2. Increment powerLeftBV / powerRightBV.
 *   3. Write immutable PowerBvLedger entry.
 *   4. Write AdminLog (POWER_BV_ADD).
 *
 * Does NOT touch leftBV / rightBV or any bonus engine.
 */
export async function addPowerBV(
  adminId: string,
  userId:  string,
  input:   PowerBvAddInput,
): Promise<void> {
  const { side, bv, reason } = input;
  const decBv = new Prisma.Decimal(bv);

  const { ledgerEntryId } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where:  { id: userId },
      select: { id: true, powerLeftBV: true, powerRightBV: true },
    });
    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
    }

    const balanceBefore = side === "LEFT" ? user.powerLeftBV : user.powerRightBV;
    const balanceAfter  = balanceBefore.plus(decBv);

    await tx.user.update({
      where: { id: userId },
      data:  side === "LEFT"
        ? { powerLeftBV: balanceAfter }
        : { powerRightBV: balanceAfter },
    });

    const ledger = await tx.powerBvLedger.create({
      data: {
        userId,
        adminId,
        side,
        operation:     "ADD",
        bv:            decBv,
        balanceBefore,
        balanceAfter,
        reason,
      },
      select: { id: true },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "POWER_BV_ADD",
        targetUserId: userId,
        details: {
          side,
          bv:           bv.toString(),
          reason,
          balanceBefore: balanceBefore.toFixed(8),
          balanceAfter:  balanceAfter.toFixed(8),
        },
      },
    });

    return { ledgerEntryId: ledger.id };
  });

  // ── Salary business accounting (Sprint 33E) ────────────────────────────────
  // Credit the POWER pool for this user. Runs after the Power BV tx commits.
  void updatePowerBusiness(userId, ledgerEntryId, decBv, "POWER_BV_ADDED");
}

// ── Remove Power BV ───────────────────────────────────────────────────────────

/**
 * Debits Power BV from a single leg of the target user.
 * Throws INSUFFICIENT_POWER_BV if the removal would create a negative balance.
 */
export async function removePowerBV(
  adminId: string,
  userId:  string,
  input:   PowerBvRemoveInput,
): Promise<void> {
  const { side, bv, reason } = input;
  const decBv = new Prisma.Decimal(bv);

  const { ledgerEntryId } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where:  { id: userId },
      select: { id: true, powerLeftBV: true, powerRightBV: true },
    });
    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
    }

    const balanceBefore = side === "LEFT" ? user.powerLeftBV : user.powerRightBV;

    if (balanceBefore.lt(decBv)) {
      throw new AppError(
        `Insufficient Power ${side} BV — current balance: ${balanceBefore.toFixed(8)}, requested removal: ${decBv.toFixed(8)}`,
        HTTP_STATUS.BAD_REQUEST,
        "INSUFFICIENT_POWER_BV",
      );
    }

    const balanceAfter = balanceBefore.minus(decBv);

    await tx.user.update({
      where: { id: userId },
      data:  side === "LEFT"
        ? { powerLeftBV: balanceAfter }
        : { powerRightBV: balanceAfter },
    });

    const ledger = await tx.powerBvLedger.create({
      data: {
        userId,
        adminId,
        side,
        operation:     "REMOVE",
        bv:            decBv,
        balanceBefore,
        balanceAfter,
        reason,
      },
      select: { id: true },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "POWER_BV_REMOVE",
        targetUserId: userId,
        details: {
          side,
          bv:           bv.toString(),
          reason,
          balanceBefore: balanceBefore.toFixed(8),
          balanceAfter:  balanceAfter.toFixed(8),
        },
      },
    });

    return { ledgerEntryId: ledger.id };
  });

  // ── Salary business accounting (Sprint 33E) ────────────────────────────────
  // Debit the POWER pool for this user. Runs after the Power BV tx commits.
  void updatePowerBusiness(userId, ledgerEntryId, decBv, "POWER_BV_REMOVED");
}

// ── Summary ───────────────────────────────────────────────────────────────────

export async function getPowerSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id:           true,
      username:     true,
      leftBV:       true,
      rightBV:      true,
      powerLeftBV:  true,
      powerRightBV: true,
    },
  });
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  return {
    userId:           user.id,
    username:         user.username,
    organicLeftBV:    user.leftBV,
    organicRightBV:   user.rightBV,
    powerLeftBV:      user.powerLeftBV,
    powerRightBV:     user.powerRightBV,
    // Displayed in UI only — NOT used by any bonus engine in this sprint
    effectiveLeftBV:  user.leftBV.plus(user.powerLeftBV),
    effectiveRightBV: user.rightBV.plus(user.powerRightBV),
  };
}

// ── Ledger (paginated) ────────────────────────────────────────────────────────

export async function getPowerLedger(
  userId: string,
  query:  PowerBvLedgerQuery,
) {
  const { page, limit, side } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PowerBvLedgerWhereInput = {
    userId,
    ...(side && { side }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.powerBvLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        admin: {
          select: { id: true, email: true, firstName: true, lastName: true, role: true },
        },
      },
    }),
    prisma.powerBvLedger.count({ where }),
  ]);

  return {
    records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
