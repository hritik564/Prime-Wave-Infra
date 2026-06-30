/**
 * Income Dashboard Service — READ ONLY
 *
 * Aggregates data from all income engines into a single response for the
 * Income Center overview page. Does NOT execute or modify any engine.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { APP_TIMEZONE } from "../config/timezone";
import { getIncomeSummary, INCOME_TYPES } from "./income.service";
import { getMatchingSummary } from "../binary/matching.service";
import { getOrbitSummary } from "../binary/orbit.service";
import { getSalarySummary, getSalaryQualificationSummary } from "../salary/salary.service";
import { getLevelIncomeSummary } from "../levelIncome/level-income.service";

// ── Schedule helpers (read-only, adapted from financial-transparency.service) ──

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

// ── Main aggregator ────────────────────────────────────────────────────────────

export async function getIncomeDashboard(userId: string) {
  const now        = new Date();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // All reads in parallel
  const [
    incomeSummary,
    matchingSummary,
    orbitSummary,
    salarySummary,
    salaryQual,
    levelSummary,
    monthLevelAgg,
    recentTxs,
  ] = await Promise.all([
    getIncomeSummary(userId),
    getMatchingSummary(userId),
    getOrbitSummary(userId),
    getSalarySummary(userId),
    getSalaryQualificationSummary(userId),
    getLevelIncomeSummary(userId),

    // This-month level income (not exposed per-type in income summary)
    prisma.walletTransaction.aggregate({
      where: { userId, type: "LEVEL_INCOME", status: "SUCCESS", createdAt: { gte: monthStart } },
      _sum:  { amount: true },
    }),

    // 20 most recent income transactions for the history section
    prisma.walletTransaction.findMany({
      where:   { userId, type: { in: [...INCOME_TYPES] }, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      take:    20,
      select:  { id: true, type: true, amount: true, createdAt: true, description: true, status: true },
    }),
  ]);

  // ── Schedule ──
  const nextBoundary = nextLondonBoundaryISO(now);
  const nextSalaryAt = nextMonthStartISO(now);

  // ── Per-type breakdown helpers ──
  const bd = (type: string) => incomeSummary.breakdown.find(b => b.type === type)
    ?? { today: "0.00", week: "0.00", total: "0.00", percentage: "0.0", type };

  const roiB     = bd("ROI_CLAIM");
  const binaryB  = bd("BINARY_MATCH");
  const orbitB   = bd("BINARY_ORBIT");
  const salaryB  = bd("SALARY");
  const levelB   = bd("LEVEL_INCOME");

  // ── Pending this cycle (binary + orbit pending incomes) ──
  const binaryPending = matchingSummary.pendingIncome instanceof Prisma.Decimal
    ? matchingSummary.pendingIncome.toFixed(2)
    : String(matchingSummary.pendingIncome ?? "0");

  const orbitPending  = orbitSummary.pendingIncome instanceof Prisma.Decimal
    ? orbitSummary.pendingIncome.toFixed(2)
    : String(orbitSummary.pendingIncome ?? "0");

  const pendingThisCycle = new Prisma.Decimal(binaryPending)
    .plus(new Prisma.Decimal(orbitPending))
    .toFixed(2);

  const isQualifiedForAny = matchingSummary.isQualified || orbitSummary.isQualified;

  // ── Salary ──
  const monthlySalary   = salarySummary.activeMonthlySalary instanceof Prisma.Decimal
    ? salarySummary.activeMonthlySalary.toFixed(2)
    : String(salarySummary.activeMonthlySalary ?? "0");
  const salaryQualified = new Prisma.Decimal(monthlySalary).gt(0);

  // ── Level this-month ──
  const monthLevelAmt = monthLevelAgg._sum.amount instanceof Prisma.Decimal
    ? monthLevelAgg._sum.amount.toFixed(2)
    : (monthLevelAgg._sum.amount != null ? String(monthLevelAgg._sum.amount) : "0.00");

  // ── Level lifetime from levelSummary ──
  const levelLifetime = levelSummary.totalIncome instanceof Prisma.Decimal
    ? levelSummary.totalIncome.toFixed(2)
    : String(levelSummary.totalIncome ?? "0");

  // ── Timeline entries (chronological) ──
  const timeline = [
    {
      engine:          "ROI",
      label:           "Daily ROI",
      scheduledAt:     nextBoundary,
      estimatedAmount: null as string | null,
      isEstimated:     false,
      isQualified:     null as boolean | null,
    },
    {
      engine:          "Binary",
      label:           "Binary Match",
      scheduledAt:     nextBoundary,
      estimatedAmount: matchingSummary.isQualified ? binaryPending : null,
      isEstimated:     true,
      isQualified:     matchingSummary.isQualified,
    },
    {
      engine:          "Orbit",
      label:           "Binary Orbit",
      scheduledAt:     nextBoundary,
      estimatedAmount: orbitSummary.isQualified ? orbitPending : null,
      isEstimated:     true,
      isQualified:     orbitSummary.isQualified,
    },
    {
      engine:          "Salary",
      label:           "Monthly Salary",
      scheduledAt:     nextSalaryAt,
      estimatedAmount: salaryQualified ? monthlySalary : null,
      isEstimated:     false,
      isQualified:     salaryQualified,
    },
  ].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return {
    snapshot: {
      todayEarnings:     incomeSummary.periods.today,
      pendingThisCycle,
      isQualifiedForAny,
      nextCreditAt:      nextBoundary,
      salaryNextAt:      nextSalaryAt,
      monthlySalary,
      activeRanks:       salarySummary.activeRanks,
      currentRank:       salaryQual.highestRank,
      nextRank:          salaryQual.nextRank,
      rankProgressPct:   salaryQual.progressPct,
    },
    sources: {
      roi: {
        todayEarnings:    roiB.today,
        lifetimeEarnings: roiB.total,
        nextCreditAt:     nextBoundary,
      },
      binary: {
        todayEarnings:       binaryB.today,
        lifetimeEarnings:    binaryB.total,
        isQualified:         matchingSummary.isQualified,
        estimatedNextPayout: binaryPending,
        nextCycleAt:         nextBoundary,
      },
      orbit: {
        todayEarnings:       orbitB.today,
        lifetimeEarnings:    orbitB.total,
        isQualified:         orbitSummary.isQualified,
        estimatedNextPayout: orbitPending,
        nextCycleAt:         nextBoundary,
      },
      salary: {
        todayEarnings:    salaryB.today,
        lifetimeEarnings: salaryB.total,
        monthlySalary,
        activeRanks:      salarySummary.activeRanks,
        nextSalaryAt,
        isQualified:      salaryQualified,
      },
      levelIncome: {
        todayEarnings:    levelB.today,
        thisMonthEarnings: monthLevelAmt,
        lifetimeEarnings: levelLifetime,
        totalPayouts:     levelSummary.totalPayouts,
      },
    },
    timeline,
    recentIncome: recentTxs.map(tx => ({
      id:          tx.id,
      type:        tx.type,
      amount:      tx.amount instanceof Prisma.Decimal ? tx.amount.toFixed(2) : String(tx.amount),
      createdAt:   tx.createdAt.toISOString(),
      description: tx.description,
      status:      tx.status,
    })),
  };
}

export type IncomeDashboardData = Awaited<ReturnType<typeof getIncomeDashboard>>;
