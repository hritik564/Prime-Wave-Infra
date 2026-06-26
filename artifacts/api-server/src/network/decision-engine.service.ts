import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { getBinaryDownlineIds } from "./network.service";

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface ActionItem {
  id:              string;
  priority:        Priority;
  title:           string;
  description:     string;
  reason:          string;
  estimatedReward: string | null;
  rewardLabel:     string | null;
  category:        "BINARY" | "ORBIT" | "SALARY" | "MEMBER" | "REFERRAL" | "REACTIVATION";
}

export interface Opportunity {
  type:            "BINARY" | "ORBIT" | "SALARY" | "LEVEL";
  title:           string;
  description:     string;
  progressPercent: number;
  requiredAction:  string;
  estimatedReward: string | null;
  priority:        Priority;
  bvNeeded:        number | null;
  currentValue:    string;
  targetValue:     string;
}

export interface HealthCategory {
  label:   string;
  score:   number;
  maxScore: number;
  status:  "EXCELLENT" | "GOOD" | "NEEDS_ATTENTION" | "CRITICAL";
  detail:  string;
}

export interface HealthScore {
  overall:    number;
  categories: HealthCategory[];
}

export interface MemberRecommendation {
  id:                  string;
  firstName:           string;
  lastName:            string;
  username:            string;
  status:              string;
  reason:              string;
  action:              string;
  daysSinceJoined:     number;
  isPersonallySponsored: boolean;
  tag:                 "NOT_INVESTED" | "INACTIVE" | "HIGH_PRODUCER";
}

export interface QualCard {
  type:            "BINARY_MATCH" | "BINARY_ORBIT" | "SALARY" | "REFERRAL";
  title:           string;
  progressPercent: number;
  current:         string;
  remaining:       string;
  potentialReward: string;
  action:          string;
}

export interface IncomeForecast {
  hasData:        boolean;
  weeklyBinary:   string;
  monthlyBinary:  string;
  weeklyROI:      string;
  monthlyROI:     string;
  estimatedSalary: string;
  monthlyTotal:   string;
}

export interface GrowthForecast {
  hasData:                 boolean;
  confidence:              "HIGH" | "MEDIUM" | "LOW";
  monthlyTeamGrowth:       number;
  monthlyInvestmentVolume: string;
  monthlyNetworkIncome:    string;
}

export interface Mission {
  id:          string;
  title:       string;
  description: string;
  completed:   boolean;
  progress:    number;
  icon:        string;
}

export interface WeeklyObjective {
  id:              string;
  title:           string;
  current:         number;
  target:          number;
  unit:            string;
  reward:          string;
  progressPercent: number;
}

export interface DecisionEngineData {
  actionPlan:             ActionItem[];
  opportunities:          Opportunity[];
  healthScore:            HealthScore;
  memberRecommendations:  MemberRecommendation[];
  qualificationProgress:  QualCard[];
  incomeForecast:         IncomeForecast;
  growthForecast:         GrowthForecast;
  dailyMissions:          Mission[];
  weeklyObjectives:       WeeklyObjective[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function priorityOrder(p: Priority): number {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[p];
}

function healthStatus(score: number, max: number): HealthCategory["status"] {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return "EXCELLENT";
  if (pct >= 0.6) return "GOOD";
  if (pct >= 0.3) return "NEEDS_ATTENTION";
  return "CRITICAL";
}

function fmt2(n: number) { return n.toFixed(2); }
function fmtK(n: number) { return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`; }

// ── Main ──────────────────────────────────────────────────────────────────────

export async function getDecisionEngine(userId: string): Promise<DecisionEngineData> {
  const sevenDaysAgo  = new Date(Date.now() - 7  * 86_400_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const todayStart    = new Date(); todayStart.setHours(0, 0, 0, 0);

  // ── 1. User basics + downline ──────────────────────────────────────────────
  const [user, allIds] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: { leftBV: true, rightBV: true, directReferralCount: true, sponsorId: true, createdAt: true },
    }),
    getBinaryDownlineIds(userId),
  ]);
  if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

  const leftBV  = Number(user.leftBV);
  const rightBV = Number(user.rightBV);
  const minBV   = Math.min(leftBV, rightBV);
  const maxBV   = Math.max(leftBV, rightBV);
  const weakLeg: "LEFT" | "RIGHT" | "BALANCED" =
    leftBV < rightBV ? "LEFT" : rightBV < leftBV ? "RIGHT" : "BALANCED";
  const qualified       = user.directReferralCount >= 2;
  const bvNeededMatch   = qualified ? Math.max(0, 1   - minBV) : null;
  const bvNeededOrbit   = qualified ? Math.max(0, 150 - minBV) : null;
  const hasMembers      = allIds.length > 0;

  // ── 2. Parallel DB queries ─────────────────────────────────────────────────
  const [
    statusRows,
    weeklyNew,
    todayNewMembers,
    todayNewInvests,
    weeklyInvestsAgg,
    binaryHistory,
    userActiveInvests,
    uninvestedMembers,
    inactiveSponsoredMembers,
    salaryAchievement,
    salaryRankConfigs,
    membersWithInvests,
  ] = await Promise.all([
    // Active/inactive breakdown
    hasMembers
      ? prisma.user.findMany({ where: { id: { in: allIds } }, select: { status: true } })
      : Promise.resolve<{ status: string }[]>([]),

    // Weekly new members in downline
    hasMembers
      ? prisma.user.count({ where: { id: { in: allIds }, createdAt: { gte: sevenDaysAgo } } })
      : Promise.resolve(0),

    // Today's new sponsored members (for mission #1)
    prisma.user.count({ where: { sponsorId: userId, createdAt: { gte: todayStart } } }),

    // Today's new investments in downline (for mission #2)
    hasMembers
      ? prisma.investment.count({ where: { userId: { in: allIds }, createdAt: { gte: todayStart } } })
      : Promise.resolve(0),

    // This week's investment volume in downline (for growth forecast)
    hasMembers
      ? prisma.investment.aggregate({
          where: { userId: { in: allIds }, createdAt: { gte: sevenDaysAgo } },
          _sum:  { amount: true }, _count: { id: true },
        })
      : Promise.resolve({ _sum: { amount: null }, _count: { id: 0 } }),

    // Last 30 days binary income (for forecast)
    prisma.binaryMatchIncome.findMany({
      where:   { userId, createdAt: { gte: thirtyDaysAgo } },
      select:  { incomeAmount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),

    // User's own active investments (for ROI forecast)
    prisma.investment.findMany({
      where:  { userId, status: "ACTIVE" },
      select: { currentPrincipal: true, dailyROI: true },
    }),

    // Members without any investment (oldest first = most overdue)
    hasMembers
      ? prisma.user.findMany({
          where:   { id: { in: allIds }, investments: { none: {} } },
          select:  { id: true, firstName: true, lastName: true, username: true, createdAt: true, sponsorId: true, position: true },
          take:    4,
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve<{ id: string; firstName: string; lastName: string; username: string; createdAt: Date; sponsorId: string | null; position: string | null }[]>([]),

    // Inactive personally sponsored members
    hasMembers
      ? prisma.user.findMany({
          where:   { id: { in: allIds }, sponsorId: userId, NOT: { status: "ACTIVE" } },
          select:  { id: true, firstName: true, lastName: true, username: true, createdAt: true, status: true },
          take:    3,
        })
      : Promise.resolve<{ id: string; firstName: string; lastName: string; username: string; createdAt: Date; status: string }[]>([]),

    // Current salary achievement
    prisma.salaryAchievement.findFirst({
      where:   { userId, isActive: true },
      orderBy: { monthlyAmount: "desc" },
      select:  { rankName: true, monthlyAmount: true },
    }),

    // All salary rank configs (ordered by weakLegRequired ascending = easiest first)
    prisma.salaryRankConfig.findMany({
      where:   { isActive: true },
      select:  { rankName: true, monthlySalary: true, weakLegRequired: true, powerLegRequired: true, requiresDualDirects: true },
      orderBy: { monthlySalary: "asc" },
    }),

    // Count of downline members who have at least 1 active investment
    hasMembers
      ? prisma.user.count({
          where: { id: { in: allIds }, investments: { some: { status: "ACTIVE" } } },
        })
      : Promise.resolve(0),
  ]);

  // ── 3. Derived values ──────────────────────────────────────────────────────

  const totalTeam      = allIds.length;
  const activeMembers  = statusRows.filter((m) => m.status === "ACTIVE").length;
  const inactiveMembers = totalTeam - activeMembers;
  const sponsoredCount = user.directReferralCount;

  // BV math
  const matchProgress  = qualified ? Math.min(minBV, 50) / 50 * 100 : 0;
  const orbitProgress  = qualified ? Math.min(minBV, 150) / 150 * 100 : 0;
  const bvNeededNextMatch  = qualified ? Math.max(0, 50  - Math.min(minBV, 50)) : null;
  const bvNeededNextOrbit  = qualified ? Math.max(0, 150 - minBV) : null;
  const estimatedMatchReward = qualified && minBV > 0 ? Math.min(minBV, 50) * 5 : 0;

  // Salary
  const currentSalary       = Number(salaryAchievement?.monthlyAmount ?? 0);
  const currentSalaryRank   = salaryAchievement?.rankName ?? null;
  const nextSalaryRank = salaryRankConfigs.find(
    (r) => !currentSalaryRank ||
      Number(r.monthlySalary) > Number(salaryRankConfigs.find((c) => c.rankName === currentSalaryRank)?.monthlySalary ?? 0),
  );
  const nextSalaryWeakLeg = Number(nextSalaryRank?.weakLegRequired ?? 0);
  const nextSalaryPowerLeg = Number(nextSalaryRank?.powerLegRequired ?? 0);

  // Income forecast
  const monthlyBinaryRaw  = binaryHistory.reduce((s, b) => s + Number(b.incomeAmount), 0);
  const weeklyBinaryRaw   = monthlyBinaryRaw / 4;
  const weeklyROI         = userActiveInvests.reduce((s, inv) => s + Number(inv.currentPrincipal) * Number(inv.dailyROI) * 7, 0);
  const monthlyROI        = weeklyROI * 4;
  const monthlyTotal      = monthlyBinaryRaw + monthlyROI + currentSalary;
  const hasIncomeData     = binaryHistory.length > 0 || userActiveInvests.length > 0;

  // Growth forecast
  const weeklyVolume  = Number(weeklyInvestsAgg._sum.amount ?? 0);
  const monthlyVolume = weeklyVolume * 4;
  const growthConfidence: GrowthForecast["confidence"] =
    weeklyNew >= 3 ? "HIGH" : weeklyNew >= 1 ? "MEDIUM" : "LOW";
  const hasGrowthData = weeklyNew > 0 || weeklyVolume > 0;

  // ── 4. Build Action Plan ───────────────────────────────────────────────────

  const actions: ActionItem[] = [];

  // CRITICAL: Not qualified for binary income at all
  if (!qualified) {
    actions.push({
      id: "qualify-binary",
      priority: "CRITICAL",
      category: "REFERRAL",
      title: `Invite ${2 - sponsoredCount} more direct referral${2 - sponsoredCount !== 1 ? "s" : ""}`,
      description: `You need ${2 - sponsoredCount} more direct referral${2 - sponsoredCount !== 1 ? "s" : ""} to unlock binary income.`,
      reason: "Binary matching requires at least 2 personal referrals. Without this, all BV accumulation generates no reward.",
      estimatedReward: null,
      rewardLabel: "Unlocks Binary Income",
    });
  }

  // HIGH: Very close to next binary match
  if (qualified && bvNeededNextMatch !== null && bvNeededNextMatch <= 30 && bvNeededNextMatch > 0) {
    const legLabel = weakLeg === "BALANCED" ? "either leg" : `your ${weakLeg} leg`;
    actions.push({
      id: "close-binary-match",
      priority: "HIGH",
      category: "BINARY",
      title: `Add ~${Math.ceil(bvNeededNextMatch)} BV to ${legLabel}`,
      description: `You are only ${Math.ceil(bvNeededNextMatch)} BV away from earning a binary reward.`,
      reason: `Adding ${Math.ceil(bvNeededNextMatch)} BV to your ${weakLeg === "BALANCED" ? "weak leg" : weakLeg + " leg"} would complete a binary match cycle and generate approximately ${fmtK(estimatedMatchReward)}.`,
      estimatedReward: fmtK(estimatedMatchReward),
      rewardLabel: "Binary Reward",
    });
  } else if (qualified && bvNeededNextMatch !== null && bvNeededNextMatch > 30) {
    const legLabel = weakLeg !== "BALANCED" ? `your ${weakLeg} leg` : "your weaker leg";
    actions.push({
      id: "grow-binary",
      priority: "MEDIUM",
      category: "BINARY",
      title: `Strengthen ${legLabel} (${Math.ceil(bvNeededNextMatch)} BV needed)`,
      description: `Growing ${legLabel} by ${Math.ceil(bvNeededNextMatch)} BV will unlock your next binary payout.`,
      reason: `Binary matching pays $5 per matched BV (max 50 BV/cycle = $250). More BV on both legs = more frequent rewards.`,
      estimatedReward: fmtK(estimatedMatchReward > 0 ? estimatedMatchReward : 250),
      rewardLabel: "Per Cycle",
    });
  }

  // HIGH: Orbit near
  if (qualified && bvNeededNextOrbit !== null && bvNeededNextOrbit <= 50 && bvNeededNextOrbit > 0) {
    actions.push({
      id: "close-orbit",
      priority: "HIGH",
      category: "ORBIT",
      title: `Add ~${Math.ceil(bvNeededNextOrbit)} BV to reach Orbit`,
      description: `Your ${weakLeg !== "BALANCED" ? weakLeg : "weaker"} leg needs ${Math.ceil(bvNeededNextOrbit)} more BV for the $500 Orbit bonus.`,
      reason: "The Binary Orbit pays $500 when both legs exceed 150 BV per cycle — a premium tier above regular matching.",
      estimatedReward: "$500",
      rewardLabel: "Orbit Bonus",
    });
  }

  // HIGH: Uninvested personally sponsored members
  const uninvestedSponsored = uninvestedMembers.filter((m) => m.sponsorId === userId);
  if (uninvestedSponsored.length > 0) {
    const first = uninvestedSponsored[0];
    const daysSince = Math.floor((Date.now() - first.createdAt.getTime()) / 86_400_000);
    actions.push({
      id: "help-uninvested-sponsored",
      priority: "HIGH",
      category: "MEMBER",
      title: `Help ${first.firstName} complete their first investment`,
      description: `${first.firstName} joined ${daysSince}d ago but has not invested yet.`,
      reason: `${first.firstName}'s investment generates BV for your ${first.position ?? "binary"} leg and level income for you. ${uninvestedSponsored.length > 1 ? `${uninvestedSponsored.length - 1} other personally sponsored members are also waiting.` : ""}`,
      estimatedReward: null,
      rewardLabel: "BV + Level Income",
    });
  }

  // MEDIUM: Inactive personally sponsored members
  if (inactiveSponsoredMembers.length > 0) {
    const names = inactiveSponsoredMembers.map((m) => m.firstName).slice(0, 2).join(", ");
    actions.push({
      id: "reactivate-sponsored",
      priority: "MEDIUM",
      category: "REACTIVATION",
      title: `Reconnect with ${inactiveSponsoredMembers.length} inactive sponsored member${inactiveSponsoredMembers.length !== 1 ? "s" : ""}`,
      description: `${names}${inactiveSponsoredMembers.length > 2 ? ` and ${inactiveSponsoredMembers.length - 2} more` : ""} are inactive and not generating BV.`,
      reason: "Reactivating sponsored members restores their BV contribution to your legs and increases your retention score.",
      estimatedReward: null,
      rewardLabel: "Network Health",
    });
  }

  // LOW: General uninvested
  const uninvestedOther = uninvestedMembers.filter((m) => m.sponsorId !== userId);
  if (uninvestedOther.length > 0 && uninvestedSponsored.length === 0) {
    actions.push({
      id: "support-uninvested",
      priority: "LOW",
      category: "MEMBER",
      title: `${uninvestedOther.length} team member${uninvestedOther.length !== 1 ? "s" : ""} haven't invested yet`,
      description: `Supporting ${uninvestedOther.length > 1 ? "them" : uninvestedOther[0].firstName} to invest would add BV to your legs.`,
      reason: "Each team investment contributes BV to the leg it's placed on, accelerating binary match cycles.",
      estimatedReward: null,
      rewardLabel: "BV + Cycle Speed",
    });
  }

  // Salary opportunity
  if (nextSalaryRank && (weakLeg === "BALANCED" ? maxBV : minBV) > 0) {
    const weakLegBV   = Math.min(leftBV, rightBV);
    const needed      = Math.max(0, nextSalaryWeakLeg - weakLegBV);
    const salaryAmt   = Number(nextSalaryRank.monthlySalary);
    if (needed > 0) {
      actions.push({
        id: "salary-qualification",
        priority: "LOW",
        category: "SALARY",
        title: `Progress toward ${nextSalaryRank.rankName} salary`,
        description: `Add ${Math.ceil(needed)} BV to your weak leg to qualify for the ${nextSalaryRank.rankName} monthly salary.`,
        reason: `Achieving ${nextSalaryRank.rankName} rank unlocks a ${fmtK(salaryAmt)}/month salary — a guaranteed recurring income on top of binary rewards.`,
        estimatedReward: `${fmtK(salaryAmt)}/mo`,
        rewardLabel: "Monthly Salary",
      });
    }
  }

  // Sort by priority
  actions.sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));

  // ── 5. Build Opportunities ─────────────────────────────────────────────────

  const opportunities: Opportunity[] = [];

  // Binary
  opportunities.push({
    type:            "BINARY",
    title:           "Binary Match Opportunity",
    description:     qualified
      ? (bvNeededNextMatch === 0
        ? `Both legs are matched — you will earn ${fmtK(Math.min(minBV, 50) * 5)} on the next cycle.`
        : `You need ${Math.ceil(bvNeededNextMatch ?? 0)} more BV on your ${weakLeg !== "BALANCED" ? weakLeg : "weaker"} leg.`)
      : "Invite 2 direct referrals to unlock binary matching.",
    progressPercent: Math.round(matchProgress),
    requiredAction:  qualified
      ? (weakLeg !== "BALANCED" ? `Add BV to ${weakLeg} leg` : "Maintain balance")
      : "Invite 2 direct referrals",
    estimatedReward: qualified ? fmtK(estimatedMatchReward > 0 ? estimatedMatchReward : 250) : null,
    priority:        qualified ? (bvNeededNextMatch !== null && bvNeededNextMatch <= 30 ? "HIGH" : "MEDIUM") : "CRITICAL",
    bvNeeded:        bvNeededNextMatch !== null ? Math.ceil(bvNeededNextMatch) : null,
    currentValue:    `${minBV.toFixed(0)} BV (min leg)`,
    targetValue:     "50 BV matched",
  });

  // Orbit
  opportunities.push({
    type:            "ORBIT",
    title:           "Orbit Bonus Opportunity",
    description:     qualified
      ? (bvNeededNextOrbit === 0
        ? "Both legs exceed 150 BV — you are earning $500 Orbit bonuses every cycle!"
        : `Add ${Math.ceil(bvNeededNextOrbit ?? 0)} BV to your ${weakLeg !== "BALANCED" ? weakLeg : "weaker"} leg for the $500 Orbit bonus.`)
      : "Qualify for binary income first, then grow both legs to 150 BV.",
    progressPercent: Math.round(orbitProgress),
    requiredAction:  qualified
      ? (bvNeededNextOrbit === 0 ? "Maintain both legs above 150 BV" : `Grow ${weakLeg !== "BALANCED" ? weakLeg : "weaker"} leg`)
      : "Unlock binary income first",
    estimatedReward: "$500",
    priority:        qualified
      ? (bvNeededNextOrbit !== null && bvNeededNextOrbit <= 50 ? "HIGH" : "MEDIUM")
      : "LOW",
    bvNeeded:        bvNeededNextOrbit !== null ? Math.ceil(bvNeededNextOrbit) : null,
    currentValue:    `${minBV.toFixed(0)} BV (min leg)`,
    targetValue:     "150 BV both legs",
  });

  // Salary
  if (nextSalaryRank) {
    const weakLegBV   = Math.min(leftBV, rightBV);
    const needed      = Math.max(0, nextSalaryWeakLeg - weakLegBV);
    const pct         = nextSalaryWeakLeg > 0 ? Math.min(weakLegBV / nextSalaryWeakLeg * 100, 100) : 0;
    opportunities.push({
      type:            "SALARY",
      title:           `${nextSalaryRank.rankName} Salary Opportunity`,
      description:     needed === 0
        ? `You meet the BV requirements for ${nextSalaryRank.rankName} rank!`
        : `Your weak leg needs ${Math.ceil(needed)} more BV to qualify for the ${nextSalaryRank.rankName} monthly salary.`,
      progressPercent: Math.round(pct),
      requiredAction:  needed === 0
        ? `Ensure ${nextSalaryRank.requiresDualDirects ? "dual direct referrals" : "team size"} requirements`
        : `Add ${Math.ceil(needed)} BV to weak leg`,
      estimatedReward: `${fmtK(Number(nextSalaryRank.monthlySalary))}/mo`,
      priority:        pct >= 80 ? "HIGH" : pct >= 50 ? "MEDIUM" : "LOW",
      bvNeeded:        needed > 0 ? Math.ceil(needed) : null,
      currentValue:    `${weakLegBV.toFixed(0)} BV`,
      targetValue:     `${nextSalaryWeakLeg.toFixed(0)} BV (weak leg)`,
    });
  }

  // Level income (if uninvested sponsored members present)
  if (uninvestedSponsored.length > 0) {
    const first = uninvestedSponsored[0];
    opportunities.push({
      type:            "LEVEL",
      title:           "Level Income Opportunity",
      description:     `${first.firstName}'s first investment would generate level income directly to you.`,
      progressPercent: 0,
      requiredAction:  `Help ${first.firstName} make their first investment`,
      estimatedReward: null,
      priority:        "MEDIUM",
      bvNeeded:        null,
      currentValue:    `${uninvestedSponsored.length} sponsored member${uninvestedSponsored.length !== 1 ? "s" : ""} uninvested`,
      targetValue:     "All sponsored members invested",
    });
  }

  // ── 6. Build Health Score ──────────────────────────────────────────────────

  // Recruitment (25pts): direct referrals + sponsored count
  const recruitScore = Math.min(25,
    (qualified ? 10 : 0) +
    Math.min(15, user.directReferralCount * 3),
  );
  // Investment Activity (25pts): % members with active investment
  const investPct     = totalTeam > 0 ? membersWithInvests / totalTeam : 0;
  const investScore   = Math.round(investPct * 25);
  // Balance (20pts): minBV/maxBV ratio
  const balancePct    = maxBV > 0 ? minBV / maxBV : 0;
  const balanceScore  = Math.round(balancePct * 20);
  // Retention (20pts): active ratio
  const retentionPct  = totalTeam > 0 ? activeMembers / totalTeam : 0;
  const retentionScore = Math.round(retentionPct * 20);
  // Growth (10pts): weekly new members
  const growthScore   = Math.min(10, weeklyNew * 2);
  const overallHealth = Math.min(100, recruitScore + investScore + balanceScore + retentionScore + growthScore);

  const healthScore: HealthScore = {
    overall: overallHealth,
    categories: [
      {
        label:    "Recruitment",
        score:    recruitScore,
        maxScore: 25,
        status:   healthStatus(recruitScore, 25),
        detail:   `${user.directReferralCount} direct referral${user.directReferralCount !== 1 ? "s" : ""} · ${qualified ? "Qualified" : "Needs 2+ referrals"}`,
      },
      {
        label:    "Investment Activity",
        score:    investScore,
        maxScore: 25,
        status:   healthStatus(investScore, 25),
        detail:   `${membersWithInvests} of ${totalTeam} members actively investing (${Math.round(investPct * 100)}%)`,
      },
      {
        label:    "Balance",
        score:    balanceScore,
        maxScore: 20,
        status:   healthStatus(balanceScore, 20),
        detail:   `${leftBV.toFixed(0)} L / ${rightBV.toFixed(0)} R BV · ${Math.round(balancePct * 100)}% balanced`,
      },
      {
        label:    "Retention",
        score:    retentionScore,
        maxScore: 20,
        status:   healthStatus(retentionScore, 20),
        detail:   `${activeMembers} active, ${inactiveMembers} inactive (${Math.round(retentionPct * 100)}% retention)`,
      },
      {
        label:    "Growth",
        score:    growthScore,
        maxScore: 10,
        status:   healthStatus(growthScore, 10),
        detail:   `${weeklyNew} new member${weeklyNew !== 1 ? "s" : ""} this week`,
      },
    ],
  };

  // ── 7. Member Recommendations ──────────────────────────────────────────────

  const memberRecommendations: MemberRecommendation[] = [];

  uninvestedMembers.slice(0, 3).forEach((m) => {
    const days = Math.floor((Date.now() - m.createdAt.getTime()) / 86_400_000);
    memberRecommendations.push({
      id:       m.id,
      firstName: m.firstName,
      lastName:  m.lastName,
      username:  m.username,
      status:    "INACTIVE",
      reason:    `Joined ${days} day${days !== 1 ? "s" : ""} ago but has not made any investment.`,
      action:    "Help complete first investment",
      daysSinceJoined: days,
      isPersonallySponsored: m.sponsorId === userId,
      tag: "NOT_INVESTED",
    });
  });

  inactiveSponsoredMembers.slice(0, 2).forEach((m) => {
    // Only add if not already in list
    if (!memberRecommendations.find((r) => r.id === m.id)) {
      const days = Math.floor((Date.now() - m.createdAt.getTime()) / 86_400_000);
      memberRecommendations.push({
        id:       m.id,
        firstName: m.firstName,
        lastName:  m.lastName,
        username:  m.username,
        status:    m.status,
        reason:    `Personally sponsored · Inactive for ${days > 30 ? "30+" : days} day${days !== 1 ? "s" : ""}. Not contributing BV.`,
        action:    "Reconnect and reactivate",
        daysSinceJoined: days,
        isPersonallySponsored: true,
        tag: "INACTIVE",
      });
    }
  });

  memberRecommendations.sort((a, b) => {
    // Personally sponsored first, then by days since joined
    if (a.isPersonallySponsored !== b.isPersonallySponsored)
      return a.isPersonallySponsored ? -1 : 1;
    return b.daysSinceJoined - a.daysSinceJoined;
  });

  // ── 8. Qualification Progress ──────────────────────────────────────────────

  const qualificationProgress: QualCard[] = [];

  // Binary Match
  qualificationProgress.push({
    type:            "BINARY_MATCH",
    title:           "Binary Match",
    progressPercent: Math.round(matchProgress),
    current:         `${minBV.toFixed(0)} BV (min leg)`,
    remaining:       bvNeededNextMatch !== null && bvNeededNextMatch > 0
      ? `${Math.ceil(bvNeededNextMatch)} BV needed`
      : qualified ? "Ready to match!" : `Need ${2 - user.directReferralCount} more referral${2 - user.directReferralCount !== 1 ? "s" : ""}`,
    potentialReward: qualified && minBV > 0 ? fmtK(estimatedMatchReward) : qualified ? "Up to $250/cycle" : "Locked",
    action:          qualified
      ? (weakLeg !== "BALANCED" ? `Grow ${weakLeg} leg` : "Maintain balance")
      : "Invite 2 direct referrals",
  });

  // Binary Orbit
  qualificationProgress.push({
    type:            "BINARY_ORBIT",
    title:           "Binary Orbit",
    progressPercent: Math.round(orbitProgress),
    current:         `${minBV.toFixed(0)} BV (min leg)`,
    remaining:       bvNeededNextOrbit !== null && bvNeededNextOrbit > 0
      ? `${Math.ceil(bvNeededNextOrbit)} BV needed`
      : (qualified ? "Orbit active!" : "Unlock binary first"),
    potentialReward: "$500 per cycle",
    action:          qualified
      ? (weakLeg !== "BALANCED" ? `Grow ${weakLeg} leg to 150 BV` : "Maintain 150+ BV both legs")
      : "Unlock binary income first",
  });

  // Referral Qualification
  qualificationProgress.push({
    type:            "REFERRAL",
    title:           "Binary Qualification",
    progressPercent: Math.min(100, Math.round((user.directReferralCount / 2) * 100)),
    current:         `${user.directReferralCount} of 2 direct referrals`,
    remaining:       qualified ? "Fully qualified!" : `${2 - user.directReferralCount} more referral${2 - user.directReferralCount !== 1 ? "s" : ""} needed`,
    potentialReward: "Binary Income Unlocked",
    action:          qualified ? "Invite more to grow" : "Share referral link",
  });

  // Salary
  if (nextSalaryRank) {
    const weakLegBV = Math.min(leftBV, rightBV);
    const needed    = Math.max(0, nextSalaryWeakLeg - weakLegBV);
    const pct       = nextSalaryWeakLeg > 0 ? Math.min(weakLegBV / nextSalaryWeakLeg * 100, 100) : 0;
    qualificationProgress.push({
      type:            "SALARY",
      title:           `${nextSalaryRank.rankName} Rank`,
      progressPercent: Math.round(pct),
      current:         `${weakLegBV.toFixed(0)} BV weak leg`,
      remaining:       needed > 0 ? `${Math.ceil(needed)} BV on weak leg` : "BV requirement met",
      potentialReward: `${fmtK(Number(nextSalaryRank.monthlySalary))}/month`,
      action:          needed > 0
        ? `Add ${Math.ceil(needed)} BV to ${weakLeg !== "BALANCED" ? weakLeg : "weaker"} leg`
        : "Verify other rank requirements",
    });
  }

  // ── 9. Income Forecast ─────────────────────────────────────────────────────

  const incomeForecast: IncomeForecast = {
    hasData:        hasIncomeData,
    weeklyBinary:   fmt2(weeklyBinaryRaw),
    monthlyBinary:  fmt2(monthlyBinaryRaw),
    weeklyROI:      fmt2(weeklyROI),
    monthlyROI:     fmt2(monthlyROI),
    estimatedSalary: fmt2(currentSalary),
    monthlyTotal:   fmt2(monthlyTotal),
  };

  // ── 10. Growth Forecast ────────────────────────────────────────────────────

  const growthForecast: GrowthForecast = {
    hasData:                 hasGrowthData,
    confidence:              growthConfidence,
    monthlyTeamGrowth:       weeklyNew * 4,
    monthlyInvestmentVolume: fmt2(monthlyVolume),
    monthlyNetworkIncome:    fmt2(weeklyBinaryRaw * 4 + weeklyROI * 4),
  };

  // ── 11. Daily Missions ─────────────────────────────────────────────────────

  const dailyMissions: Mission[] = [
    {
      id:          "mission-sponsor",
      title:       "Personally sponsor a new member",
      description: "Share your referral link and help someone join your team today.",
      completed:   todayNewMembers > 0,
      progress:    Math.min(100, todayNewMembers * 100),
      icon:        "UserPlus",
    },
    {
      id:          "mission-invest",
      title:       "Help a team member invest",
      description: "Support a member in completing their first or next investment.",
      completed:   todayNewInvests > 0,
      progress:    Math.min(100, todayNewInvests * 100),
      icon:        "TrendingUp",
    },
    {
      id:          "mission-bv",
      title:       qualified
        ? (weakLeg !== "BALANCED"
          ? `Strengthen your ${weakLeg} leg`
          : "Maintain your balanced legs")
        : "Invite 2 direct referrals",
      description: qualified
        ? (bvNeededNextMatch !== null && bvNeededNextMatch > 0
          ? `Add ${Math.ceil(bvNeededNextMatch)} BV to your ${weakLeg !== "BALANCED" ? weakLeg : "weaker"} leg for a binary reward.`
          : "Both legs are matched — you're on track!")
        : `You need ${2 - user.directReferralCount} more direct referral${2 - user.directReferralCount !== 1 ? "s" : ""} to earn binary income.`,
      completed:   qualified
        ? (bvNeededNextMatch !== null ? bvNeededNextMatch === 0 : minBV >= 50)
        : user.directReferralCount >= 2,
      progress:    qualified
        ? Math.round(matchProgress)
        : Math.min(100, Math.round((user.directReferralCount / 2) * 100)),
      icon:        "Zap",
    },
  ];

  // ── 12. Weekly Objectives ──────────────────────────────────────────────────

  const weeklyBVTarget = Math.max(50, Math.ceil((bvNeededNextOrbit ?? 50) / 2));
  const weeklyBVCurrent = Number(weeklyInvestsAgg._sum.amount ?? 0) / 100;

  const weeklyObjectives: WeeklyObjective[] = [
    {
      id:              "obj-recruit",
      title:           "Grow your team this week",
      current:         weeklyNew,
      target:          Math.max(3, weeklyNew + 2),
      unit:            "new members",
      reward:          "Network Expansion",
      progressPercent: Math.min(100, Math.round(weeklyNew / Math.max(3, weeklyNew + 2) * 100)),
    },
    {
      id:              "obj-bv",
      title:           `Generate ${weeklyBVTarget} BV this week`,
      current:         Math.round(weeklyBVCurrent),
      target:          weeklyBVTarget,
      unit:            "BV",
      reward:          qualified ? "Binary Cycle Progress" : "Binary Unlock Progress",
      progressPercent: weeklyBVTarget > 0
        ? Math.min(100, Math.round(weeklyBVCurrent / weeklyBVTarget * 100))
        : 0,
    },
  ];

  if (inactiveSponsoredMembers.length > 0) {
    weeklyObjectives.push({
      id:              "obj-reactivate",
      title:           "Reactivate sponsored members",
      current:         0,
      target:          inactiveSponsoredMembers.length,
      unit:            "members reactivated",
      reward:          "Retention Improvement",
      progressPercent: 0,
    });
  }

  return {
    actionPlan:            actions.slice(0, 5),
    opportunities,
    healthScore,
    memberRecommendations: memberRecommendations.slice(0, 4),
    qualificationProgress,
    incomeForecast,
    growthForecast,
    dailyMissions,
    weeklyObjectives,
  };
}
