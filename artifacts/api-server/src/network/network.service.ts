import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { MembersQuery } from "./network.schema";

// ── Recursive binary downline IDs via CTE ─────────────────────────────────────

export async function getBinaryDownlineIds(userId: string): Promise<string[]> {
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

// ── Network Stats (enhanced) ───────────────────────────────────────────────────

export async function getNetworkStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, leftBV: true, rightBV: true,
      directReferralCount: true, sponsorId: true,
    },
  });
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

  // ── Downline IDs ──────────────────────────────────────────────────────────
  const allIds = await getBinaryDownlineIds(userId);
  const totalTeam = allIds.length;

  const [leftChild, rightChild] = await Promise.all([
    prisma.user.findFirst({ where: { binaryParentId: userId, position: "LEFT" },  select: { id: true } }),
    prisma.user.findFirst({ where: { binaryParentId: userId, position: "RIGHT" }, select: { id: true } }),
  ]);

  const [leftDesc, rightDesc] = await Promise.all([
    leftChild  ? getBinaryDownlineIds(leftChild.id)  : Promise.resolve([]),
    rightChild ? getBinaryDownlineIds(rightChild.id) : Promise.resolve([]),
  ]);
  const leftIds  = leftChild  ? [leftChild.id,  ...leftDesc]  : [];
  const rightIds = rightChild ? [rightChild.id, ...rightDesc] : [];

  // ── BV math ───────────────────────────────────────────────────────────────
  const leftBV  = Number(user.leftBV);
  const rightBV = Number(user.rightBV);
  const minBV   = Math.min(leftBV, rightBV);
  const maxBV   = Math.max(leftBV, rightBV);
  const weakLeg: "LEFT" | "RIGHT" | "BALANCED" =
    leftBV < rightBV ? "LEFT" : rightBV < leftBV ? "RIGHT" : "BALANCED";

  const qualified            = user.directReferralCount >= 2;
  const bvNeededForMatch     = qualified ? Math.max(0, 1    - minBV) : null;
  const bvNeededForOrbit     = qualified ? Math.max(0, 150  - minBV) : null;
  const estimatedNextBinaryReward = qualified && minBV > 0
    ? Math.min(minBV, 50) * 5 : 0;

  // ── Time boundaries ────────────────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  const todayStart   = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // ── Empty team — short-circuit ─────────────────────────────────────────────
  if (totalTeam === 0) {
    const lastBinaryIncome = await prisma.binaryMatchIncome.findFirst({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      select:  { incomeAmount: true, createdAt: true },
    });
    return {
      totalTeam: 0,
      directReferrals: user.directReferralCount,
      personallySponsored: 0,
      leftTeam: 0, rightTeam: 0,
      activeMembers: 0, inactiveMembers: 0,
      weeklyNew: 0, leftWeeklyNew: 0, rightWeeklyNew: 0,
      leftBV: user.leftBV.toFixed(2), rightBV: user.rightBV.toFixed(2),
      leftActiveInvestments: 0, rightActiveInvestments: 0,
      weakLeg, bvNeededForMatch, bvNeededForOrbit,
      estimatedNextBinaryReward: estimatedNextBinaryReward.toFixed(2),
      growthScore: Math.min(user.directReferralCount * 5, 15),
      networkPulse: {
        newMembersToday: 0, newInvestmentsToday: 0,
        lastBinaryIncomeAt: lastBinaryIncome?.createdAt.toISOString() ?? null,
        lastBinaryIncomeAmount: lastBinaryIncome?.incomeAmount.toFixed(2) ?? null,
      },
    };
  }

  // ── Parallel DB queries ────────────────────────────────────────────────────
  const [
    statusRows, weeklyNew, personallySponsored,
    leftWeeklyNew, rightWeeklyNew,
    leftActiveInvests, rightActiveInvests,
    newMembersToday, newInvestmentsToday,
    lastBinaryIncome,
  ] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: allIds } }, select: { status: true } }),
    prisma.user.count({ where: { id: { in: allIds }, createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { id: { in: allIds }, sponsorId: userId } }),
    leftIds.length  > 0 ? prisma.user.count({ where: { id: { in: leftIds  }, createdAt: { gte: sevenDaysAgo } } }) : Promise.resolve(0),
    rightIds.length > 0 ? prisma.user.count({ where: { id: { in: rightIds }, createdAt: { gte: sevenDaysAgo } } }) : Promise.resolve(0),
    leftIds.length  > 0 ? prisma.investment.count({ where: { userId: { in: leftIds  }, status: "ACTIVE" } }) : Promise.resolve(0),
    rightIds.length > 0 ? prisma.investment.count({ where: { userId: { in: rightIds }, status: "ACTIVE" } }) : Promise.resolve(0),
    prisma.user.count({ where: { id: { in: allIds }, createdAt: { gte: todayStart } } }),
    prisma.investment.count({ where: { userId: { in: allIds }, createdAt: { gte: todayStart } } }),
    prisma.binaryMatchIncome.findFirst({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      select:  { incomeAmount: true, createdAt: true },
    }),
  ]);

  const activeMembers   = statusRows.filter((m) => m.status === "ACTIVE").length;
  const inactiveMembers = totalTeam - activeMembers;

  // ── Growth score (0-100) ──────────────────────────────────────────────────
  let growthScore = 0;
  if (totalTeam > 0)          growthScore += Math.round((activeMembers / totalTeam) * 25);
  if (maxBV > 0)              growthScore += Math.round((minBV / maxBV) * 25);
  growthScore += Math.min(Math.round(weeklyNew * 4), 20);
  growthScore += Math.min(user.directReferralCount * 5, 15);
  growthScore += Math.min(totalTeam, 15);
  growthScore  = Math.min(100, growthScore);

  return {
    totalTeam,
    directReferrals: user.directReferralCount,
    personallySponsored,
    leftTeam:  leftIds.length,
    rightTeam: rightIds.length,
    activeMembers,
    inactiveMembers,
    weeklyNew,
    leftWeeklyNew,
    rightWeeklyNew,
    leftBV:  user.leftBV.toFixed(2),
    rightBV: user.rightBV.toFixed(2),
    leftActiveInvestments:  leftActiveInvests,
    rightActiveInvestments: rightActiveInvests,
    weakLeg,
    bvNeededForMatch,
    bvNeededForOrbit,
    estimatedNextBinaryReward: estimatedNextBinaryReward.toFixed(2),
    growthScore,
    networkPulse: {
      newMembersToday,
      newInvestmentsToday,
      lastBinaryIncomeAt:     lastBinaryIncome?.createdAt.toISOString() ?? null,
      lastBinaryIncomeAmount: lastBinaryIncome?.incomeAmount.toFixed(2)  ?? null,
    },
  };
}

// ── Network Members (enhanced) ────────────────────────────────────────────────

export async function getNetworkMembers(userId: string, opts: MembersQuery) {
  const allIds = await getBinaryDownlineIds(userId);
  if (allIds.length === 0) {
    return { members: [], total: 0, page: opts.page, limit: opts.limit };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  // ── Base filter ────────────────────────────────────────────────────────────
  const baseFilter: Prisma.UserWhereInput = { id: { in: allIds } };

  const searchFilter: Prisma.UserWhereInput = opts.search
    ? { OR: [
        { username:  { contains: opts.search, mode: "insensitive" } },
        { firstName: { contains: opts.search, mode: "insensitive" } },
        { lastName:  { contains: opts.search, mode: "insensitive" } },
      ] }
    : {};

  const filterMap: Record<string, Prisma.UserWhereInput> = {
    all:            {},
    active:         { status: "ACTIVE" },
    inactive:       { NOT: { status: "ACTIVE" } },
    sponsored:      { sponsorId: userId },
    spillover:      { NOT: { sponsorId: userId } },
    new:            { createdAt: { gte: sevenDaysAgo } },
    high_producers: { directReferralCount: { gte: 2 } },
    vip:            { status: "ACTIVE", directReferralCount: { gte: 2 } },
  };

  const where: Prisma.UserWhereInput = {
    AND: [baseFilter, searchFilter, filterMap[opts.filter] ?? {}],
  };

  // ── Sort ───────────────────────────────────────────────────────────────────
  const orderBy: Prisma.UserOrderByWithRelationInput =
    opts.sort === "recent" ? { createdAt: "desc" } : { createdAt: "desc" }; // investments-based sorts handled post-query

  const [total, members] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true, username: true, firstName: true, lastName: true,
        status: true, position: true, createdAt: true,
        directReferralCount: true, sponsorId: true,
        investments: {
          where:  { status: "ACTIVE" },
          select: { id: true, amount: true, planType: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { investments: { where: { status: "ACTIVE" } } } },
      },
      orderBy,
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
  ]);

  const result = members.map((m) => {
    const activeInv = m.investments[0];
    const totalInvested = m.investments.reduce((s, i) => s + Number(i.amount), 0);
    const generatedBV   = (totalInvested / 100).toFixed(2);
    return {
      id:               m.id,
      username:         m.username,
      firstName:        m.firstName,
      lastName:         m.lastName,
      status:           m.status,
      position:         m.position,
      joinedAt:         m.createdAt.toISOString(),
      directReferrals:  m.directReferralCount,
      activeInvestments: m._count.investments,
      investedAmount:   totalInvested.toFixed(2),
      plans:            m.investments.map((i) => i.planType),
      isPersonallySponsored: m.sponsorId === userId,
      isSpillover:           m.sponsorId !== userId,
      currentPlan:      activeInv ? activeInv.planType : null,
      generatedBV,
    };
  });

  // ── Post-sort for investment-based orderings ───────────────────────────────
  if (opts.sort === "highest_investment") {
    result.sort((a, b) => Number(b.investedAmount) - Number(a.investedAmount));
  } else if (opts.sort === "highest_bv") {
    result.sort((a, b) => Number(b.generatedBV) - Number(a.generatedBV));
  }

  return { members: result, total, page: opts.page, limit: opts.limit };
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

  if (user.directReferralCount < 2) {
    insights.push({
      type: "alert", title: "Binary Income Locked",
      message: `You need ${2 - user.directReferralCount} more direct referral(s) to unlock binary matching.`,
      metric: `${user.directReferralCount}/2 referrals`, action: "Invite members",
    });
  } else {
    insights.push({
      type: "success", title: "Binary Income Active",
      message: "You meet the referral requirement. Grow both legs to maximise binary payouts.",
      metric: `${user.directReferralCount} direct referrals`, action: "Grow faster",
    });
  }

  if (leftBV + rightBV > 0) {
    const imbalance = maxBV > 0 ? (maxBV - minBV) / maxBV : 0;
    if (imbalance > 0.5) {
      const weakLeg = leftBV <= rightBV ? "LEFT" : "RIGHT";
      insights.push({
        type: "warning", title: "Leg Imbalance Detected",
        message: `Your ${weakLeg} leg has significantly less BV. Focus recruitment there to unlock matching.`,
        metric: `${leftBV.toFixed(0)} L / ${rightBV.toFixed(0)} R BV`, action: `Boost ${weakLeg}`,
      });
    } else {
      insights.push({
        type: "success", title: "Balanced BV Legs",
        message: "Your legs are well-balanced — keep growing both sides for optimal binary payouts.",
        metric: `${leftBV.toFixed(0)} L / ${rightBV.toFixed(0)} R BV`, action: "Keep it up",
      });
    }
  }

  if (minBV >= 150) {
    insights.push({
      type: "gold", title: "Orbit Bonuses Active",
      message: "Both legs exceed 150 BV — you're earning $500 orbit bonuses every cycle.",
      metric: `${minBV.toFixed(0)} min BV`, action: "Maximise orbits",
    });
  } else if (leftBV + rightBV > 0) {
    const needed  = Math.ceil(150 - minBV);
    const weakLeg = leftBV <= rightBV ? "LEFT" : "RIGHT";
    insights.push({
      type: "info", title: "$500 Orbit Bonus Near",
      message: `Add ${needed} BV to your ${weakLeg} leg to unlock the $500 orbit reward per cycle.`,
      metric: `Need ${needed} more BV`, action: `Grow ${weakLeg}`,
    });
  }

  if (totalTeam === 0) {
    insights.push({
      type: "info", title: "Build Your Network",
      message: "Share your referral link to invite your first team member and start earning.",
      metric: "0 members", action: "Share now",
    });
  } else if (totalTeam < 10) {
    insights.push({
      type: "info", title: "Growing Network",
      message: `Your team of ${totalTeam} is building momentum. Target 10+ for consistent binary income.`,
      metric: `${totalTeam} members`, action: "Keep recruiting",
    });
  } else {
    insights.push({
      type: "success", title: `${totalTeam}+ Member Network`,
      message: "Strong foundation. Focus on activating inactive members to maximise earning potential.",
      metric: `${totalTeam} total`, action: "Activate members",
    });
  }

  // Check for unsponsored members with investments (opportunity insight)
  if (allIds.length > 0) {
    const unseeded = await prisma.user.count({
      where: { id: { in: allIds }, investments: { none: {} } },
    });
    if (unseeded > 0) {
      insights.push({
        type: "warning", title: `${unseeded} Uninvested Members`,
        message: `${unseeded} team member${unseeded > 1 ? "s have" : " has"} not invested yet. Supporting them could strengthen your legs.`,
        metric: `${unseeded} pending`, action: "Follow up",
      });
    }
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
      id: true, username: true, firstName: true, lastName: true,
      status: true, directReferralCount: true, createdAt: true,
    },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    performers: topByInvested.map((p, idx) => {
      const u = userMap.get(p.userId);
      return {
        rank: idx + 1, id: p.userId,
        username:        u?.username      ?? "unknown",
        firstName:       u?.firstName     ?? "",
        lastName:        u?.lastName      ?? "",
        status:          u?.status        ?? "INACTIVE",
        directReferrals: u?.directReferralCount ?? 0,
        totalInvested:   Number(p._sum.amount ?? 0).toFixed(2),
        joinedAt:        u?.createdAt.toISOString() ?? new Date().toISOString(),
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
      take:    12,
      select: {
        userId: true, amount: true, planType: true, createdAt: true,
        user: { select: { username: true, firstName: true, position: true } },
      },
    }),
    prisma.user.findMany({
      where:   { id: { in: allIds }, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take:    12,
      select:  { id: true, username: true, firstName: true, createdAt: true, position: true },
    }),
  ]);

  const activities = [
    ...recentInvestments.map((inv) => ({
      id:          `inv-${inv.userId}-${inv.createdAt.getTime()}`,
      type:        "investment" as const,
      username:    inv.user.username,
      firstName:   inv.user.firstName,
      position:    inv.user.position as string | null,
      description: `invested $${Number(inv.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${inv.planType.replace("PLAN_", "")}-day plan`,
      at:          inv.createdAt.toISOString(),
    })),
    ...recentJoins.map((u) => ({
      id:          `join-${u.id}`,
      type:        "join" as const,
      username:    u.username,
      firstName:   u.firstName,
      position:    u.position as string | null,
      description: `joined your network`,
      at:          u.createdAt.toISOString(),
    })),
  ];

  activities.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { activities: activities.slice(0, 20) };
}

// ── Member Income Journey ─────────────────────────────────────────────────────

export async function getMemberJourney(currentUserId: string, memberId: string) {
  // Verify member is in downline
  const allIds = await getBinaryDownlineIds(currentUserId);
  if (!allIds.includes(memberId)) {
    throw new AppError("Member is not in your network", HTTP_STATUS.FORBIDDEN, "FORBIDDEN");
  }

  const [member, investments, bvAgg, levelAgg, binaryMatches] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: memberId },
      select: {
        id: true, username: true, firstName: true, lastName: true,
        status: true, sponsorId: true, position: true,
        directReferralCount: true, createdAt: true,
        _count: { select: { binaryChildren: true } },
      },
    }),
    prisma.investment.findMany({
      where:   { userId: memberId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, amount: true, planType: true, status: true,
        startedAt: true, maturesAt: true,
      },
    }),
    prisma.matchBvLedger.aggregate({
      where: { userId: currentUserId, investorId: memberId },
      _sum:  { bv: true },
    }),
    prisma.levelIncome.aggregate({
      where: { receiverUserId: currentUserId, sourceUserId: memberId },
      _sum:  { incomeAmount: true },
    }),
    prisma.binaryMatchIncome.findMany({
      where:   { userId: currentUserId },
      orderBy: { createdAt: "desc" },
      take:    3,
      select:  { id: true, matchedBV: true, incomeAmount: true, cycleEnd: true, createdAt: true },
    }),
  ]);

  if (!member) throw new AppError("Member not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

  const totalInvested       = investments.reduce((s, i) => s + Number(i.amount), 0);
  const totalBVContributed  = Number(bvAgg._sum.bv ?? 0);
  const totalLevelIncome    = Number(levelAgg._sum.incomeAmount ?? 0);

  return {
    member: {
      id:                  member.id,
      username:            member.username,
      firstName:           member.firstName,
      lastName:            member.lastName,
      status:              member.status,
      sponsorId:           member.sponsorId,
      position:            member.position,
      directReferralCount: member.directReferralCount,
      childrenCount:       member._count.binaryChildren,
      joinedAt:            member.createdAt.toISOString(),
      isPersonallySponsored: member.sponsorId === currentUserId,
    },
    investments: investments.map((i) => ({
      id:          i.id,
      amount:      i.amount.toFixed(2),
      planType:    i.planType,
      status:      i.status,
      bvGenerated: (Number(i.amount) / 100).toFixed(2),
      startedAt:   i.startedAt.toISOString(),
      maturesAt:   i.maturesAt.toISOString(),
    })),
    totalInvested:              totalInvested.toFixed(2),
    totalBVContributed:         totalBVContributed.toFixed(2),
    totalLevelIncomeGenerated:  totalLevelIncome.toFixed(2),
    recentBinaryMatches: binaryMatches.map((b) => ({
      id:           b.id,
      matchedBV:    b.matchedBV.toFixed(2),
      incomeAmount: b.incomeAmount.toFixed(2),
      cycleEnd:     b.cycleEnd.toISOString(),
      createdAt:    b.createdAt.toISOString(),
    })),
  };
}
