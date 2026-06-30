/**
 * Income Detail Service — READ ONLY
 *
 * Aggregates data for each engine's dedicated detail page.
 * All reads from existing production service functions — no new calculations.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { APP_TIMEZONE } from "../config/timezone";
import { getIncomeSummary } from "./income.service";
import { getMatchingSummary } from "../binary/matching.service";
import { getOrbitSummary } from "../binary/orbit.service";
import { getSalarySummary, getSalaryQualificationSummary } from "../salary/salary.service";
import { getLevelIncomeSummary } from "../levelIncome/level-income.service";

// ── Schedule helpers (read-only, same as dashboard service) ────────────────────

function londonOffsetMs(date: Date): number {
  const utcStr    = date.toLocaleString("en-GB", { timeZone: "UTC" });
  const londonStr = date.toLocaleString("en-GB", { timeZone: APP_TIMEZONE });
  const parse = (s: string): Date => {
    const [datePart, timePart] = s.split(", ");
    const [d, m, y]            = (datePart ?? "").split("/").map(Number);
    const [h, min, sec]        = (timePart ?? "").split(":").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!, h!, min!, sec!));
  };
  return parse(londonStr).getTime() - parse(utcStr).getTime();
}

function nextLondonBoundaryISO(now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts       = fmt.formatToParts(now);
  const get         = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const londonHour  = get("hour");
  const londonMin   = get("minute");
  const londonSec   = get("second");
  const secsIntoDay = londonHour * 3_600 + londonMin * 60 + londonSec;
  const secsUntil   = londonHour < 12
    ? 12 * 3_600 - secsIntoDay
    : 24 * 3_600 - secsIntoDay;
  return new Date(now.getTime() + secsUntil * 1_000).toISOString();
}

function nextMonthStartISO(now: Date): string {
  const london = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts  = london.formatToParts(now);
  const get    = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const [year, month, day, hour, minute] =
    [get("year"), get("month"), get("day"), get("hour"), get("minute")];

  if (day === 1 && hour === 0 && minute === 0) return new Date(now.getTime() + 1_000).toISOString();

  let targetYear  = year;
  let targetMonth = month + 1;
  if (targetMonth > 12) { targetMonth = 1; targetYear++; }

  const approxTarget = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 0, 0, 0));
  const offsetMs     = londonOffsetMs(approxTarget);
  return new Date(approxTarget.getTime() - offsetMs).toISOString();
}

function d2s(v: unknown): string {
  if (v instanceof Prisma.Decimal) return v.toFixed(2);
  if (v == null) return "0.00";
  return String(v);
}

// ── ROI Detail ─────────────────────────────────────────────────────────────────

export async function getRoiDetail(userId: string) {
  const now          = new Date();
  const nextBoundary = nextLondonBoundaryISO(now);

  const [incomeSummary, activeInvestments] = await Promise.all([
    getIncomeSummary(userId),
    prisma.investment.findMany({
      where:   { userId, status: { in: ["ACTIVE", "MATURED"] } },
      select:  {
        id: true, amount: true, currentPrincipal: true, planType: true,
        dailyROI: true, durationDays: true, autoCompound: true,
        claimableROI: true, status: true, startedAt: true, maturesAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const roiB = incomeSummary.breakdown.find(b => b.type === "ROI_CLAIM")
    ?? { today: "0.00", week: "0.00", total: "0.00", percentage: "0.0", type: "ROI_CLAIM" };

  const totalPrincipal = activeInvestments
    .filter(i => i.status === "ACTIVE")
    .reduce((s, i) => s.plus(i.currentPrincipal), new Prisma.Decimal(0));

  const totalClaimableROI = activeInvestments
    .reduce((s, i) => s.plus(i.claimableROI), new Prisma.Decimal(0));

  const hasAutoCompound = activeInvestments.some(i => i.status === "ACTIVE" && i.autoCompound);
  const activeCount     = activeInvestments.filter(i => i.status === "ACTIVE").length;

  return {
    nextCreditAt:         nextBoundary,
    todayROI:             roiB.today,
    lifetimeROI:          roiB.total,
    claimableROI:         totalClaimableROI.toFixed(2),
    totalActivePrincipal: totalPrincipal.toFixed(2),
    hasAutoCompound,
    activeCount,
    investments: activeInvestments.map(i => ({
      id:          i.id,
      planType:    i.planType,
      principal:   d2s(i.currentPrincipal),
      dailyROI:    i.dailyROI instanceof Prisma.Decimal ? i.dailyROI.toFixed(4) : String(i.dailyROI),
      durationDays: i.durationDays,
      autoCompound: i.autoCompound,
      claimableROI: d2s(i.claimableROI),
      status:      i.status,
      startedAt:   i.startedAt.toISOString(),
      maturesAt:   i.maturesAt.toISOString(),
    })),
  };
}

// ── Binary Detail ──────────────────────────────────────────────────────────────

export async function getBinaryDetail(userId: string) {
  const now          = new Date();
  const nextBoundary = nextLondonBoundaryISO(now);

  const [incomeSummary, matchingSummary] = await Promise.all([
    getIncomeSummary(userId),
    getMatchingSummary(userId),
  ]);

  const binaryB = incomeSummary.breakdown.find(b => b.type === "BINARY_MATCH")
    ?? { today: "0.00", week: "0.00", total: "0.00", percentage: "0.0", type: "BINARY_MATCH" };

  const leftD  = matchingSummary.currentLeftBV  instanceof Prisma.Decimal
    ? matchingSummary.currentLeftBV  : new Prisma.Decimal(d2s(matchingSummary.currentLeftBV));
  const rightD = matchingSummary.currentRightBV instanceof Prisma.Decimal
    ? matchingSummary.currentRightBV : new Prisma.Decimal(d2s(matchingSummary.currentRightBV));

  // Carry forward = stronger leg - weaker leg (unmatched BV that persists)
  const carryForward = Prisma.Decimal.max(leftD, rightD)
    .minus(Prisma.Decimal.min(leftD, rightD))
    .toFixed(2);

  return {
    isQualified:         matchingSummary.isQualified,
    directReferralCount: matchingSummary.directReferralCount,
    nextCreditAt:        nextBoundary,
    estimatedPayout:     d2s(matchingSummary.pendingIncome),
    currentLeftBV:       d2s(matchingSummary.currentLeftBV),
    currentRightBV:      d2s(matchingSummary.currentRightBV),
    matchedBV:           d2s(matchingSummary.pendingMatchBV),
    carryForward,
    todayEarnings:       binaryB.today,
    lifetimeEarnings:    binaryB.total,
    allTimeCycles:       matchingSummary.allTime.cycles,
    allTimeIncome:       d2s(matchingSummary.allTime.incomeAmount),
  };
}

// ── Orbit Detail ───────────────────────────────────────────────────────────────

export async function getOrbitDetail(userId: string) {
  const now          = new Date();
  const nextBoundary = nextLondonBoundaryISO(now);

  const [incomeSummary, orbitSummary] = await Promise.all([
    getIncomeSummary(userId),
    getOrbitSummary(userId),
  ]);

  const orbitB = incomeSummary.breakdown.find(b => b.type === "BINARY_ORBIT")
    ?? { today: "0.00", week: "0.00", total: "0.00", percentage: "0.0", type: "BINARY_ORBIT" };

  const bvPerReward   = orbitSummary.settings.bvPerReward;
  const incomePerReward = orbitSummary.settings.incomePerReward;

  const leftD  = orbitSummary.currentLeftBV instanceof Prisma.Decimal
    ? orbitSummary.currentLeftBV  : new Prisma.Decimal(d2s(orbitSummary.currentLeftBV));
  const rightD = orbitSummary.currentRightBV instanceof Prisma.Decimal
    ? orbitSummary.currentRightBV : new Prisma.Decimal(d2s(orbitSummary.currentRightBV));

  const matchedBV   = Prisma.Decimal.min(leftD, rightD);
  const bvPRDec     = new Prisma.Decimal(bvPerReward);
  // Progress within the current orbit cycle
  const bvProgress  = matchedBV.mod(bvPRDec).toFixed(2);
  const bvRemaining = bvPRDec.minus(matchedBV.mod(bvPRDec)).toFixed(2);

  return {
    isQualified:         orbitSummary.isQualified,
    directReferralCount: orbitSummary.directReferralCount,
    nextCreditAt:        nextBoundary,
    estimatedReward:     d2s(orbitSummary.pendingIncome),
    pendingRewardCount:  orbitSummary.pendingRewardCount,
    currentLeftBV:       d2s(orbitSummary.currentLeftBV),
    currentRightBV:      d2s(orbitSummary.currentRightBV),
    matchedBV:           matchedBV.toFixed(2),
    rewardThreshold:     String(bvPerReward),
    incomePerReward:     String(incomePerReward),
    bvProgress,
    bvRemaining,
    todayEarnings:       orbitB.today,
    lifetimeEarnings:    orbitB.total,
    allTimeCycles:       orbitSummary.allTime?.cycles ?? 0,
    allTimeIncome:       d2s(orbitSummary.allTime?.incomeAmount),
  };
}

// ── Salary Detail ──────────────────────────────────────────────────────────────

export async function getSalaryDetail(userId: string) {
  const now         = new Date();
  const nextSalaryAt = nextMonthStartISO(now);

  const [incomeSummary, salarySummary, salaryQual] = await Promise.all([
    getIncomeSummary(userId),
    getSalarySummary(userId),
    getSalaryQualificationSummary(userId),
  ]);

  const salaryB = incomeSummary.breakdown.find(b => b.type === "SALARY")
    ?? { today: "0.00", week: "0.00", total: "0.00", percentage: "0.0", type: "SALARY" };

  const monthlySalary   = d2s(salarySummary.activeMonthlySalary);
  const lifetimeSalary  = d2s(salarySummary.lifetimeSalaryIncome);
  const isQualified     = new Prisma.Decimal(monthlySalary).gt(0);

  return {
    isQualified,
    nextSalaryAt,
    monthlySalary,
    lifetimeSalary,
    activeRanks:       salarySummary.activeRanks,
    currentRank:       salaryQual.highestRank ?? null,
    nextRank:          salaryQual.nextRank ?? null,
    progressPct:       salaryQual.progressPct ?? 0,
    remainingBusiness: salaryQual.remaining != null ? String(salaryQual.remaining) : "0",
    leftBusinessUSD:   salaryQual.leftBusinessUSD != null ? String(salaryQual.leftBusinessUSD) : "0",
    rightBusinessUSD:  salaryQual.rightBusinessUSD != null ? String(salaryQual.rightBusinessUSD) : "0",
    totalBusinessUSD:  salaryQual.totalBusinessUSD != null ? String(salaryQual.totalBusinessUSD) : "0",
    todayEarnings:     salaryB.today,
  };
}

// ── Level Income Detail ────────────────────────────────────────────────────────

export async function getLevelDetail(userId: string) {
  const now        = new Date();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [incomeSummary, levelSummary, monthAgg] = await Promise.all([
    getIncomeSummary(userId),
    getLevelIncomeSummary(userId),
    prisma.walletTransaction.aggregate({
      where: { userId, type: "LEVEL_INCOME", status: "SUCCESS", createdAt: { gte: monthStart } },
      _sum:  { amount: true },
    }),
  ]);

  const levelB = incomeSummary.breakdown.find(b => b.type === "LEVEL_INCOME")
    ?? { today: "0.00", week: "0.00", total: "0.00", percentage: "0.0", type: "LEVEL_INCOME" };

  const thisMonthEarnings = monthAgg._sum.amount != null
    ? d2s(monthAgg._sum.amount) : "0.00";

  return {
    todayEarnings:    levelB.today,
    thisMonthEarnings,
    lifetimeEarnings: d2s(levelSummary.totalIncome),
    totalPayouts:     levelSummary.totalPayouts,
    breakdown:        levelSummary.breakdown.map(b => ({
      level:        b.level,
      count:        b.count,
      percentage:   b.percentage,
      incomeAmount: d2s(b.incomeAmount),
    })),
  };
}

export type RoiDetailData    = Awaited<ReturnType<typeof getRoiDetail>>;
export type BinaryDetailData = Awaited<ReturnType<typeof getBinaryDetail>>;
export type OrbitDetailData  = Awaited<ReturnType<typeof getOrbitDetail>>;
export type SalaryDetailData = Awaited<ReturnType<typeof getSalaryDetail>>;
export type LevelDetailData  = Awaited<ReturnType<typeof getLevelDetail>>;
