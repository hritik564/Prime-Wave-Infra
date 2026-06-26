import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { MembersQuery } from "./network.schema";

// ── Recursive binary downline IDs via CTE ─────────────────────────────────────

async function getBinaryDownlineIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE bd AS (
      SELECT id FROM users WHERE "binaryParentId" = ${userId}::text
      UNION ALL
      SELECT u.id FROM users u
      INNER JOIN bd ON u."binaryParentId" = bd.id
    )
    SELECT id FROM bd
  `;
  return rows.map((r) => r.id);
}

// ── Network Stats ──────────────────────────────────────────────────────────────

export async function getNetworkStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, leftBV: true, rightBV: true, directReferralCount: true },
  });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

  const allIds = await getBinaryDownlineIds(userId);
  const totalTeam = allIds.length;

  const [leftChild, rightChild] = await Promise.all([
    prisma.user.findFirst({
      where: { binaryParentId: userId, position: "LEFT" },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { binaryParentId: userId, position: "RIGHT" },
      select: { id: true },
    }),
  ]);

  const [leftDescendants, rightDescendants] = await Promise.all([
    leftChild ? getBinaryDownlineIds(leftChild.id) : Promise.resolve([]),
    rightChild ? getBinaryDownlineIds(rightChild.id) : Promise.resolve([]),
  ]);

  const leftTeam  = leftChild  ? leftDescendants.length  + 1 : 0;
  const rightTeam = rightChild ? rightDescendants.length + 1 : 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const [statusRows, weeklyNew] =
    allIds.length > 0
      ? await Promise.all([
          prisma.user.findMany({
            where: { id: { in: allIds } },
            select: { status: true },
          }),
          prisma.user.count({
            where: { id: { in: allIds }, createdAt: { gte: sevenDaysAgo } },
          }),
        ])
      : ([[], 0] as const);

  const activeMembers   = statusRows.filter((m) => m.status === "ACTIVE").length;
  const inactiveMembers = totalTeam - activeMembers;

  return {
    totalTeam,
    directReferrals: user.directReferralCount,
    leftTeam,
    rightTeam,
    activeMembers,
    inactiveMembers,
    weeklyNew,
    leftBV:  user.leftBV.toFixed(2),
    rightBV: user.rightBV.toFixed(2),
  };
}

// ── Network Members ────────────────────────────────────────────────────────────

export async function getNetworkMembers(userId: string, opts: MembersQuery) {
  const allIds = await getBinaryDownlineIds(userId);
  if (allIds.length === 0) {
    return { members: [], total: 0, page: opts.page, limit: opts.limit };
  }

  const statusFilter: Prisma.UserWhereInput =
    opts.filter === "active"
      ? { status: "ACTIVE" }
      : opts.filter === "inactive"
      ? { NOT: { status: "ACTIVE" } }
      : {};

  const searchFilter: Prisma.UserWhereInput = opts.search
    ? {
        OR: [
          { username:  { contains: opts.search, mode: "insensitive" } },
          { firstName: { contains: opts.search, mode: "insensitive" } },
          { lastName:  { contains: opts.search, mode: "insensitive" } },
        ],
      }
    : {};

  const where: Prisma.UserWhereInput = {
    AND: [{ id: { in: allIds } }, searchFilter, statusFilter],
  };

  const [total, members] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id:                  true,
        username:            true,
        firstName:           true,
        lastName:            true,
        status:              true,
        position:            true,
        createdAt:           true,
        directReferralCount: true,
        investments: {
          where:  { status: "ACTIVE" },
          select: { id: true, amount: true, planType: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip:  (opts.page - 1) * opts.limit,
      take:  opts.limit,
    }),
  ]);

  return {
    members: members.map((m) => ({
      id:               m.id,
      username:         m.username,
      firstName:        m.firstName,
      lastName:         m.lastName,
      status:           m.status,
      position:         m.position,
      joinedAt:         m.createdAt.toISOString(),
      directReferrals:  m.directReferralCount,
      activeInvestments: m.investments.length,
      investedAmount:   m.investments
        .reduce((s, i) => s + Number(i.amount), 0)
        .toFixed(2),
      plans: [...new Set(m.investments.map((i) => i.planType))],
    })),
    total,
    page:  opts.page,
    limit: opts.limit,
  };
}

// ── Network Insights ──────────────────────────────────────────────────────────

export async function getNetworkInsights(userId: string) {
  const [user, allIds] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: { leftBV: true, rightBV: true, directReferralCount: true },
    }),
    getBinaryDownlineIds(userId),
  ]);
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

  const leftBV  = Number(user.leftBV);
  const rightBV = Number(user.rightBV);
  const minBV   = Math.min(leftBV, rightBV);
  const maxBV   = Math.max(leftBV, rightBV);
  const totalTeam = allIds.length;

  const insights: {
    type:    "success" | "warning" | "alert" | "info" | "gold";
    title:   string;
    message: string;
    metric:  string;
    action:  string;
  }[] = [];

  // ── 1. Binary income qualification ────────────────────────────────────────
  if (user.directReferralCount < 2) {
    insights.push({
      type:    "alert",
      title:   "Binary Income Locked",
      message: `You need ${2 - user.directReferralCount} more direct referral(s) to unlock binary matching and orbit income.`,
      metric:  `${user.directReferralCount}/2 referrals`,
      action:  "Invite members",
    });
  } else {
    insights.push({
      type:    "success",
      title:   "Binary Income Active",
      message: "You have the minimum referrals to earn binary income. Grow both legs to maximize payouts.",
      metric:  `${user.directReferralCount} direct referrals`,
      action:  "Grow faster",
    });
  }

  // ── 2. BV leg balance ─────────────────────────────────────────────────────
  if (leftBV + rightBV > 0) {
    const imbalance = maxBV > 0 ? (maxBV - minBV) / maxBV : 0;
    if (imbalance > 0.5) {
      const weakLeg = leftBV <= rightBV ? "LEFT" : "RIGHT";
      insights.push({
        type:    "warning",
        title:   "Leg Imbalance Detected",
        message: `Your ${weakLeg} leg has significantly less BV. Focus there to maximise matching income.`,
        metric:  `${leftBV.toFixed(0)} L / ${rightBV.toFixed(0)} R BV`,
        action:  `Boost ${weakLeg} leg`,
      });
    } else {
      insights.push({
        type:    "success",
        title:   "Balanced BV Legs",
        message: "Your legs are well-balanced. Keep growing both sides to maximise binary matching payouts.",
        metric:  `${leftBV.toFixed(0)} L / ${rightBV.toFixed(0)} R BV`,
        action:  "Keep it up",
      });
    }
  }

  // ── 3. Orbit qualification (needs 150 BV min) ─────────────────────────────
  if (minBV >= 150) {
    insights.push({
      type:    "gold",
      title:   "Orbit Bonuses Active",
      message: "Both legs exceed 150 BV — you're earning $500 orbit bonuses each payout cycle.",
      metric:  `${minBV.toFixed(0)} min BV`,
      action:  "Maximise orbits",
    });
  } else if (leftBV + rightBV > 0) {
    const needed  = Math.ceil(150 - minBV);
    const weakLeg = leftBV <= rightBV ? "LEFT" : "RIGHT";
    insights.push({
      type:    "info",
      title:   "$500 Orbit Bonus Near",
      message: `Add ${needed} BV to your ${weakLeg} leg to unlock the $500 orbit reward per cycle.`,
      metric:  `Need ${needed} more BV`,
      action:  `Grow ${weakLeg} leg`,
    });
  }

  // ── 4. Team size milestone ────────────────────────────────────────────────
  if (totalTeam === 0) {
    insights.push({
      type:    "info",
      title:   "Build Your Network",
      message: "Share your referral link to invite your first member and start earning network income.",
      metric:  "0 team members",
      action:  "Share referral",
    });
  } else if (totalTeam < 10) {
    insights.push({
      type:    "info",
      title:   "Growing Network",
      message: `Your team of ${totalTeam} is building momentum. Target 10+ members for consistent binary income.`,
      metric:  `${totalTeam} members`,
      action:  "Keep recruiting",
    });
  } else {
    insights.push({
      type:    "success",
      title:   `${totalTeam}+ Member Network`,
      message: "Solid foundation! Focus on activating inactive members to maximise earning potential.",
      metric:  `${totalTeam} total members`,
      action:  "Activate members",
    });
  }

  return { insights: insights.slice(0, 5) };
}

// ── Top Performers ────────────────────────────────────────────────────────────

export async function getTopPerformers(userId: string) {
  const allIds = await getBinaryDownlineIds(userId);
  if (allIds.length === 0) return { performers: [] };

  const topByInvested = await prisma.investment.groupBy({
    by:      ["userId"],
    where:   { userId: { in: allIds } },
    _sum:    { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take:    5,
  });

  if (topByInvested.length === 0) return { performers: [] };

  const topIds = topByInvested.map((p) => p.userId);
  const users  = await prisma.user.findMany({
    where:  { id: { in: topIds } },
    select: {
      id:                  true,
      username:            true,
      firstName:           true,
      lastName:            true,
      status:              true,
      directReferralCount: true,
      createdAt:           true,
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    performers: topByInvested.map((p, idx) => {
      const u = userMap.get(p.userId);
      return {
        rank:           idx + 1,
        id:             p.userId,
        username:       u?.username      ?? "unknown",
        firstName:      u?.firstName     ?? "",
        lastName:       u?.lastName      ?? "",
        status:         u?.status        ?? "INACTIVE",
        directReferrals: u?.directReferralCount ?? 0,
        totalInvested:  Number(p._sum.amount ?? 0).toFixed(2),
        joinedAt:       u?.createdAt.toISOString() ?? new Date().toISOString(),
      };
    }),
  };
}

// ── Team Activity ─────────────────────────────────────────────────────────────

export async function getTeamActivity(userId: string) {
  const allIds = await getBinaryDownlineIds(userId);
  if (allIds.length === 0) return { activities: [] };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);

  const [recentInvestments, recentJoins] = await Promise.all([
    prisma.investment.findMany({
      where:   { userId: { in: allIds } },
      orderBy: { createdAt: "desc" },
      take:    10,
      select: {
        userId:    true,
        amount:    true,
        planType:  true,
        createdAt: true,
        user:      { select: { username: true, firstName: true } },
      },
    }),
    prisma.user.findMany({
      where:   { id: { in: allIds }, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take:    10,
      select:  { id: true, username: true, firstName: true, createdAt: true },
    }),
  ]);

  const activities = [
    ...recentInvestments.map((inv) => ({
      id:          `inv-${inv.userId}-${inv.createdAt.getTime()}`,
      type:        "investment" as const,
      username:    inv.user.username,
      firstName:   inv.user.firstName,
      description: `invested $${Number(inv.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} in ${inv.planType.replace("PLAN_", "")}-day plan`,
      at:          inv.createdAt.toISOString(),
    })),
    ...recentJoins.map((u) => ({
      id:          `join-${u.id}`,
      type:        "join" as const,
      username:    u.username,
      firstName:   u.firstName,
      description: "joined your network",
      at:          u.createdAt.toISOString(),
    })),
  ];

  activities.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return { activities: activities.slice(0, 15) };
}
