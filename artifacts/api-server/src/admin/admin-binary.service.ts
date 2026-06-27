import { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { AdminBinaryListQuery, SaveBinaryNotesInput } from "./admin-binary.schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(s: string): "ACTIVE" | "INACTIVE" | "SUSPENDED" {
  if (s === "ACTIVE")   return "ACTIVE";
  if (s === "INACTIVE") return "INACTIVE";
  return "SUSPENDED";
}

function filterStatusToDb(s: string): UserStatus[] {
  if (s === "ACTIVE")   return ["ACTIVE"];
  if (s === "INACTIVE") return ["INACTIVE"];
  return ["SUSPENDED", "BLOCKED"];
}

const VALID_RANKS = ["DIAMOND", "PLATINUM", "ELITE", "PRO", "GROWTH", "STARTER"];

function normaliseRank(rankName: string | undefined): string {
  if (!rankName) return "UNRANKED";
  const up = rankName.toUpperCase();
  return VALID_RANKS.includes(up) ? up : "UNRANKED";
}

/** UTC midnight of today. */
function todayUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

// ── Binary-network user filter (must be a node in the tree) ───────────────────

const IN_NETWORK: Prisma.UserWhereInput = {
  OR: [
    { binaryParentId: { not: null } },
    { binaryChildren: { some: {} } },
  ],
};

// ── Shared selects ────────────────────────────────────────────────────────────

const listUserSelect = {
  id:                  true,
  username:            true,
  firstName:           true,
  lastName:            true,
  status:              true,
  position:            true,
  leftBV:              true,
  rightBV:             true,
  referralCode:        true,
  directReferralCount: true,
  createdAt:           true,
  sponsor: { select: { username: true } },
  binaryParent: { select: { username: true } },
  binaryChildren: {
    select:  { username: true, position: true },
    orderBy: { createdAt: "asc" as const },
  },
  investments: {
    where:   { status: "ACTIVE" as const },
    take:    1,
    orderBy: { createdAt: "desc" as const },
    select:  { planType: true },
  },
  salaryAchievements: {
    where:   { isActive: true },
    take:    1,
    orderBy: { achievedAt: "desc" as const },
    select:  { rankName: true },
  },
} as const;

// ── List ──────────────────────────────────────────────────────────────────────

export async function getAdminBinaryNetwork(query: AdminBinaryListQuery) {
  const { page, limit, search, status, position, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  const userWhere: Prisma.UserWhereInput = {
    ...IN_NETWORK,
    ...(status   ? { status: { in: filterStatusToDb(status) } } : {}),
    ...(position ? { position }                                  : {}),
    ...(search   ? {
      OR: [
        { username:    { contains: search, mode: "insensitive" as const } },
        { firstName:   { contains: search, mode: "insensitive" as const } },
        { lastName:    { contains: search, mode: "insensitive" as const } },
        { referralCode:{ contains: search, mode: "insensitive" as const } },
        { sponsor: { username: { contains: search, mode: "insensitive" as const } } },
      ],
    } : {}),
  };

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sortBy === "leftBV"              ? { leftBV:              sortOrder } :
    sortBy === "rightBV"             ? { rightBV:             sortOrder } :
    sortBy === "directReferralCount" ? { directReferralCount: sortOrder } :
                                       { createdAt:           sortOrder };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where:   userWhere,
      orderBy,
      skip,
      take:    limit,
      select:  listUserSelect,
    }),
    prisma.user.count({ where: userWhere }),
  ]);

  if (users.length === 0) {
    return {
      data: [],
      meta: { total: 0, page, limit, totalPages: 0, hasNextPage: false, hasPrevPage: false },
    };
  }

  const userIds = users.map(u => u.id);
  const today   = todayUtc();
  const weekAgo = new Date(today);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);

  const [todayInc, weekInc, monthInc, lifetimeInc] = await Promise.all([
    prisma.binaryMatchIncome.groupBy({
      by:    ["userId"],
      where: { userId: { in: userIds }, cycleStart: { gte: today } },
      _sum:  { incomeAmount: true },
    }),
    prisma.binaryMatchIncome.groupBy({
      by:    ["userId"],
      where: { userId: { in: userIds }, cycleStart: { gte: weekAgo } },
      _sum:  { incomeAmount: true },
    }),
    prisma.binaryMatchIncome.groupBy({
      by:    ["userId"],
      where: { userId: { in: userIds }, cycleStart: { gte: monthAgo } },
      _sum:  { incomeAmount: true },
    }),
    prisma.binaryMatchIncome.groupBy({
      by:    ["userId"],
      where: { userId: { in: userIds } },
      _sum:  { incomeAmount: true },
    }),
  ]);

  type GRow = { userId: string; _sum: { incomeAmount: Prisma.Decimal | null } };
  const toMap = (arr: GRow[]) =>
    new Map(arr.map(r => [r.userId, Number(r._sum.incomeAmount ?? 0)]));

  const todayMap    = toMap(todayInc);
  const weekMap     = toMap(weekInc);
  const monthMap    = toMap(monthInc);
  const lifetimeMap = toMap(lifetimeInc);

  const data = users.map(u => {
    const leftBV      = Number(u.leftBV);
    const rightBV     = Number(u.rightBV);
    const carryForward = Math.abs(leftBV - rightBV);
    const rank         = normaliseRank(u.salaryAchievements[0]?.rankName);
    const leftChild    = u.binaryChildren.find(c => c.position === "LEFT");
    const rightChild   = u.binaryChildren.find(c => c.position === "RIGHT");

    return {
      id:                 u.id,
      memberId:           u.referralCode,
      username:           u.username,
      firstName:          u.firstName,
      lastName:           u.lastName,
      sponsor:            u.sponsor?.username ?? "",
      sponsorUsername:    u.sponsor?.username ?? "",
      position:           (u.position ?? "LEFT") as "LEFT" | "RIGHT",
      leftBV,
      rightBV,
      carryForward,
      rank,
      status:             mapStatus(u.status),
      plan:               u.investments[0]?.planType ?? null,
      directReferrals:    u.directReferralCount,
      parentUsername:     u.binaryParent?.username ?? null,
      leftChildUsername:  leftChild?.username  ?? null,
      rightChildUsername: rightChild?.username ?? null,
      todayMatch:         todayMap.get(u.id)    ?? 0,
      weeklyMatch:        weekMap.get(u.id)     ?? 0,
      monthlyMatch:       monthMap.get(u.id)    ?? 0,
      lifetimeMatch:      lifetimeMap.get(u.id) ?? 0,
      matchingHistory:    [] as unknown[],
      recentEvents:       [] as unknown[],
      warnings:           [] as unknown[],
      auditLog:           [] as unknown[],
      nextRank:           null,
      rankProgress:       0,
      rankRequirements:   [] as unknown[],
      adminNotes:         "",
    };
  });

  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

// ── Stats / KPIs ──────────────────────────────────────────────────────────────

export async function getAdminBinaryStats() {
  const today = todayUtc();

  const [totalMembers, activeMembers, bvAgg, todayMatchAgg] = await Promise.all([
    prisma.user.count({ where: IN_NETWORK }),
    prisma.user.count({ where: { ...IN_NETWORK, status: "ACTIVE" } }),
    prisma.user.aggregate({
      where: IN_NETWORK,
      _sum:  { leftBV: true, rightBV: true },
    }),
    prisma.binaryMatchIncome.aggregate({
      where: { cycleStart: { gte: today } },
      _sum:  { matchedBV: true, incomeAmount: true },
    }),
  ]);

  const totalLeftBV  = Number(bvAgg._sum.leftBV  ?? 0);
  const totalRightBV = Number(bvAgg._sum.rightBV ?? 0);
  const todayMatchedBV = Number(todayMatchAgg._sum.matchedBV    ?? 0);
  const todayRewards   = Number(todayMatchAgg._sum.incomeAmount ?? 0);

  // Carry forward = SUM(ABS(leftBV - rightBV)) across all network users
  const carryRows = await prisma.$queryRaw<Array<{ carry: string | null }>>`
    SELECT CAST(
      COALESCE(
        SUM(ABS("leftBV"::numeric - "rightBV"::numeric)),
        0
      ) AS text
    ) AS carry
    FROM users
    WHERE "binaryParentId" IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM users c WHERE c."binaryParentId" = users.id
      )
  `;

  const carryForwardBV = parseFloat(carryRows[0]?.carry ?? "0") || 0;
  const networkHealth  = totalMembers > 0
    ? Math.round((activeMembers / totalMembers) * 100)
    : 100;

  return {
    totalMembers,
    activeMembers,
    totalLeftBV,
    totalRightBV,
    todayMatchedBV,
    todayRewards,
    carryForwardBV,
    networkHealth,
  };
}

// ── Detail (drawer) ───────────────────────────────────────────────────────────

export async function getAdminBinaryDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      ...listUserSelect,
      binaryMatchIncome: {
        orderBy: { cycleStart: "desc" as const },
        take:    30,
        select:  {
          id:               true,
          matchedBV:        true,
          payableBV:        true,
          destroyedBV:      true,
          flushedBV:        true,
          carryForwardLeft: true,
          carryForwardRight:true,
          incomeAmount:     true,
          cycleStart:       true,
          cycleEnd:         true,
          createdAt:        true,
        },
      },
      adminLogs: {
        orderBy: { createdAt: "desc" as const },
        take:    50,
        select:  {
          id:        true,
          action:    true,
          details:   true,
          createdAt: true,
          admin: { select: { email: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const today    = todayUtc();
  const weekAgo  = new Date(today); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const monthAgo = new Date(today); monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);

  const [todayAgg, weekAgg, monthAgg, lifetimeAgg] = await Promise.all([
    prisma.binaryMatchIncome.aggregate({ where: { userId, cycleStart: { gte: today } },    _sum: { incomeAmount: true } }),
    prisma.binaryMatchIncome.aggregate({ where: { userId, cycleStart: { gte: weekAgo } },  _sum: { incomeAmount: true } }),
    prisma.binaryMatchIncome.aggregate({ where: { userId, cycleStart: { gte: monthAgo } }, _sum: { incomeAmount: true } }),
    prisma.binaryMatchIncome.aggregate({ where: { userId },                                 _sum: { incomeAmount: true } }),
  ]);

  const leftBV       = Number(user.leftBV);
  const rightBV      = Number(user.rightBV);
  const carryForward = Math.abs(leftBV - rightBV);
  const rank         = normaliseRank(user.salaryAchievements[0]?.rankName);
  const leftChild    = user.binaryChildren.find(c => c.position === "LEFT");
  const rightChild   = user.binaryChildren.find(c => c.position === "RIGHT");

  // ── Matching history ───────────────────────────────────────────────────────
  const matchingHistory = user.binaryMatchIncome.map(m => {
    const matched          = Number(m.matchedBV);
    const carryLeft        = Number(m.carryForwardLeft);
    const carryRight       = Number(m.carryForwardRight);
    const reconstructedL   = matched + carryLeft;
    const reconstructedR   = matched + carryRight;
    return {
      id:          m.id,
      timestamp:   m.cycleEnd,
      leftBV:      reconstructedL,
      rightBV:     reconstructedR,
      matched:     matched * 2,
      reward:      Number(m.incomeAmount),
      carryForward: carryLeft + carryRight,
    };
  });

  // ── Recent events ─────────────────────────────────────────────────────────
  const recentEvents = [
    {
      id:          `JOIN-${user.id}`,
      type:        "JOIN" as const,
      description: "Member joined the binary network",
      timestamp:   user.createdAt,
      value:       undefined as number | undefined,
    },
    ...user.binaryMatchIncome.slice(0, 5).map(m => ({
      id:          `MATCH-${m.id}`,
      type:        "MATCH" as const,
      description: `Binary match cycle executed — ${Number(m.matchedBV).toFixed(0)} BV matched`,
      timestamp:   m.cycleEnd,
      value:       Number(m.incomeAmount),
    })),
    ...user.adminLogs
      .filter(l => l.action !== "BINARY_NOTE")
      .slice(0, 5)
      .map(l => ({
        id:          `LOG-${l.id}`,
        type:        (l.action.toLowerCase().includes("carry") ? "CARRY_RESET" : "PLACEMENT") as
                       "CARRY_RESET" | "PLACEMENT",
        description: l.action,
        timestamp:   l.createdAt,
        value:       undefined as number | undefined,
      })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10);

  // ── Warnings ──────────────────────────────────────────────────────────────
  const warnings: Array<{
    id: string;
    type: "LARGE_IMBALANCE" | "WEAK_LEFT" | "WEAK_RIGHT" | "INACTIVE_SPONSOR" | "NO_REFERRALS" | "HIGH_CARRY";
    message: string;
    severity: "warn" | "error";
  }> = [];

  const ratio = leftBV > 0 && rightBV > 0
    ? Math.max(leftBV, rightBV) / Math.min(leftBV, rightBV)
    : 1;

  if (ratio > 3)
    warnings.push({ id: `W-${userId}-0`, type: "LARGE_IMBALANCE", message: `Leg ratio is ${ratio.toFixed(1)}x. Significant imbalance between left and right legs detected.`, severity: "error" });
  if (leftBV < 500 && leftBV > 0)
    warnings.push({ id: `W-${userId}-1`, type: "WEAK_LEFT",  message: "Left leg BV is below 500. Consider placing new members on the left side.", severity: "warn" });
  if (rightBV < 500 && rightBV > 0)
    warnings.push({ id: `W-${userId}-2`, type: "WEAK_RIGHT", message: "Right leg BV is below 500. Consider placing new members on the right side.", severity: "warn" });
  if (user.status === "INACTIVE")
    warnings.push({ id: `W-${userId}-3`, type: "INACTIVE_SPONSOR", message: "Member is inactive. Downlines may be orphaned if no action is taken.", severity: "error" });
  if (carryForward > 5000)
    warnings.push({ id: `W-${userId}-4`, type: "HIGH_CARRY", message: "Carry forward BV is unusually high. This may indicate long-term leg imbalance.", severity: "warn" });

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditLog = user.adminLogs
    .filter(l => l.action !== "BINARY_NOTE")
    .map(l => ({
      id:        l.id,
      timestamp: l.createdAt,
      admin:     `${l.admin.firstName} ${l.admin.lastName} (${l.admin.email})`,
      action:    l.action,
      detail:    (() => {
        if (l.details === null || l.details === undefined) return "";
        if (typeof l.details === "object") return JSON.stringify(l.details);
        return String(l.details);
      })(),
    }));

  // ── Admin notes (latest BINARY_NOTE entry) ────────────────────────────────
  const noteLog = user.adminLogs.find(l => l.action === "BINARY_NOTE");
  const adminNotes = (() => {
    if (!noteLog || noteLog.details === null || noteLog.details === undefined) return "";
    if (typeof noteLog.details === "object" && "notes" in (noteLog.details as object)) {
      return (noteLog.details as { notes: string }).notes ?? "";
    }
    return "";
  })();

  return {
    id:                 user.id,
    memberId:           user.referralCode,
    username:           user.username,
    firstName:          user.firstName,
    lastName:           user.lastName,
    sponsor:            user.sponsor?.username ?? "",
    sponsorUsername:    user.sponsor?.username ?? "",
    position:           (user.position ?? "LEFT") as "LEFT" | "RIGHT",
    leftBV,
    rightBV,
    carryForward,
    rank,
    status:             mapStatus(user.status),
    plan:               user.investments[0]?.planType ?? null,
    directReferrals:    user.directReferralCount,
    parentUsername:     user.binaryParent?.username ?? null,
    leftChildUsername:  leftChild?.username  ?? null,
    rightChildUsername: rightChild?.username ?? null,
    todayMatch:         Number(todayAgg._sum.incomeAmount    ?? 0),
    weeklyMatch:        Number(weekAgg._sum.incomeAmount     ?? 0),
    monthlyMatch:       Number(monthAgg._sum.incomeAmount    ?? 0),
    lifetimeMatch:      Number(lifetimeAgg._sum.incomeAmount ?? 0),
    matchingHistory,
    recentEvents,
    warnings,
    auditLog,
    nextRank:           null,
    rankProgress:       0,
    rankRequirements:   [],
    adminNotes,
  };
}

// ── Save admin notes ──────────────────────────────────────────────────────────

export async function saveAdminBinaryNotes(
  adminId: string,
  userId:  string,
  input:   SaveBinaryNotesInput,
): Promise<{ userId: string; username: string; notes: string }> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, username: true },
  });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");

  await prisma.adminLog.create({
    data: {
      adminId,
      targetUserId: userId,
      action:  "BINARY_NOTE",
      details: { notes: input.notes } as Prisma.InputJsonValue,
    },
  });

  return { userId, username: user.username, notes: input.notes };
}
