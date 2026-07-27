import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { AppError } from "../middleware/error.middleware.js";
import { HTTP_STATUS } from "../shared/constants.js";
import type {
  PowerBvAddInput, PowerBvRemoveInput, PowerBvLedgerQuery,
  GlobalPowerLedgerQuery, PowerBvSearchQuery,
} from "./power-bv.schema.js";
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

    // Credit power BV to the legacy column (salary/reports) AND to both
    // independent engine pools so matching and orbit receive equal credits.
    await tx.user.update({
      where: { id: userId },
      data:  side === "LEFT"
        ? {
            powerLeftBV:    balanceAfter,   // legacy power counter
            matchingLeftBV: { increment: decBv }, // matching engine pool
            orbitLeftBV:    { increment: decBv }, // orbit engine pool
          }
        : {
            powerRightBV:    balanceAfter,
            matchingRightBV: { increment: decBv },
            orbitRightBV:    { increment: decBv },
          },
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

    // Debit power BV from the legacy column AND from both independent engine pools.
    await tx.user.update({
      where: { id: userId },
      data:  side === "LEFT"
        ? {
            powerLeftBV:    balanceAfter,
            matchingLeftBV: { decrement: decBv },
            orbitLeftBV:    { decrement: decBv },
          }
        : {
            powerRightBV:    balanceAfter,
            matchingRightBV: { decrement: decBv },
            orbitRightBV:    { decrement: decBv },
          },
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

// ── Global stats (Sprint 35) ──────────────────────────────────────────────────

export async function getGlobalPowerStats() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [activeBV, assigned, removed, memberCount, todayCount, weekCount] = await Promise.all([
    prisma.user.aggregate({ _sum: { powerLeftBV: true, powerRightBV: true } }),
    prisma.powerBvLedger.aggregate({ where: { operation: "ADD" },    _sum: { bv: true }, _count: true }),
    prisma.powerBvLedger.aggregate({ where: { operation: "REMOVE" }, _sum: { bv: true } }),
    prisma.user.count({
      where: { OR: [{ powerLeftBV: { gt: 0 } }, { powerRightBV: { gt: 0 } }] },
    }),
    prisma.powerBvLedger.count({
      where: { operation: "ADD", createdAt: { gte: todayStart } },
    }),
    prisma.powerBvLedger.count({
      where: { operation: "ADD", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const totalActivePowerBV = new Prisma.Decimal(activeBV._sum.powerLeftBV ?? 0)
    .plus(activeBV._sum.powerRightBV ?? 0);
  const totalAssigned  = new Prisma.Decimal(assigned._sum.bv ?? 0);
  const totalRemoved   = new Prisma.Decimal(removed._sum.bv  ?? 0);
  const consumed       = totalAssigned.minus(totalRemoved).minus(totalActivePowerBV);

  return {
    totalActivePowerBV,
    totalPowerBusiness:             totalActivePowerBV.times(100),
    totalMembersWithPowerBV:        memberCount,
    totalPowerBVAssigned:           totalAssigned,
    totalPowerBVAdminRemoved:       totalRemoved,
    totalPowerBVConsumedByMatching: consumed.lt(0) ? new Prisma.Decimal(0) : consumed,
    totalLedgerEntries:             assigned._count,
    todayAssignments:               todayCount,
    last7DaysAssignments:           weekCount,
  };
}

// ── Global ledger (Sprint 35) ─────────────────────────────────────────────────

export async function getGlobalPowerLedger(query: GlobalPowerLedgerQuery) {
  const { page, limit, side, operation, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PowerBvLedgerWhereInput = {
    ...(side      && { side }),
    ...(operation && { operation }),
    ...(search    && {
      user: {
        OR: [
          { username:  { contains: search, mode: "insensitive" } },
          { email:     { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName:  { contains: search, mode: "insensitive" } },
        ],
      },
    }),
  };

  const [records, total] = await Promise.all([
    prisma.powerBvLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      include: {
        user:  { select: { id: true, username: true, email: true, firstName: true, lastName: true } },
        admin: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      },
    }),
    prisma.powerBvLedger.count({ where }),
  ]);

  return {
    records,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ── Analytics (Sprint 35) ─────────────────────────────────────────────────────

export async function getGlobalPowerAnalytics() {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const todayStart      = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [topUsersRaw, largestAssignments, recentEntries, todayStats] = await Promise.all([
    prisma.user.findMany({
      where:   { OR: [{ powerLeftBV: { gt: 0 } }, { powerRightBV: { gt: 0 } }] },
      select:  { id: true, username: true, email: true, powerLeftBV: true, powerRightBV: true },
    }),
    prisma.powerBvLedger.findMany({
      where:   { operation: "ADD" },
      orderBy: { bv: "desc" },
      take:    10,
      include: {
        user:  { select: { id: true, username: true } },
        admin: { select: { email: true } },
      },
    }),
    prisma.powerBvLedger.findMany({
      where:   { operation: "ADD", createdAt: { gte: fourteenDaysAgo } },
      select:  { createdAt: true, bv: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.powerBvLedger.aggregate({
      where:  { operation: "ADD", createdAt: { gte: todayStart } },
      _sum:   { bv: true },
      _count: true,
    }),
  ]);

  const topByPowerBV = topUsersRaw
    .map(u => ({ ...u, totalPowerBV: u.powerLeftBV.plus(u.powerRightBV) }))
    .sort((a, b) => b.totalPowerBV.comparedTo(a.totalPowerBV))
    .slice(0, 10);

  const dailyMap = new Map<string, { count: number; bv: Prisma.Decimal }>();
  for (const entry of recentEntries) {
    const key  = entry.createdAt.toISOString().slice(0, 10);
    const prev = dailyMap.get(key) ?? { count: 0, bv: new Prisma.Decimal(0) };
    dailyMap.set(key, { count: prev.count + 1, bv: prev.bv.plus(entry.bv) });
  }

  return {
    topByPowerBV,
    largestAssignments,
    dailyTrend: Array.from(dailyMap.entries()).map(([date, d]) => ({
      date, count: d.count, bv: d.bv,
    })),
    todayAssignedBV:      todayStats._sum.bv ?? new Prisma.Decimal(0),
    todayAssignmentCount: todayStats._count,
  };
}

// ── Member search (Sprint 35) ─────────────────────────────────────────────────

export async function searchPowerMembers(query: PowerBvSearchQuery) {
  const { q, limit } = query;

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username:  { contains: q, mode: "insensitive" } },
        { email:     { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName:  { contains: q, mode: "insensitive" } },
        { id: q },
      ],
    },
    select: {
      id: true, username: true, email: true, firstName: true, lastName: true,
      powerLeftBV: true, powerRightBV: true,
    },
    take:    limit,
    orderBy: { powerLeftBV: "desc" },
  });

  return users.map(u => ({
    id:            u.id,
    username:      u.username,
    email:         u.email,
    firstName:     u.firstName,
    lastName:      u.lastName,
    powerLeftBV:   u.powerLeftBV,
    powerRightBV:  u.powerRightBV,
    totalPowerBV:  u.powerLeftBV.plus(u.powerRightBV),
    powerBusiness: u.powerLeftBV.plus(u.powerRightBV).times(100),
  }));
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
