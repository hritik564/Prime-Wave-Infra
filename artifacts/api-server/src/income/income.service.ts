import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

export const INCOME_TYPES = [
  "BINARY_MATCH",
  "BINARY_ORBIT",
  "LEVEL_INCOME",
  "SALARY",
  "ROI_CLAIM",
] as const;

export type IncomeType = (typeof INCOME_TYPES)[number];
export type TrendPeriod = "7d" | "30d" | "90d" | "1y" | "all";

function getPeriodStart(period: TrendPeriod): Date | null {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "7d":  d.setDate(d.getDate() - 7);       return d;
    case "30d": d.setDate(d.getDate() - 30);      return d;
    case "90d": d.setDate(d.getDate() - 90);      return d;
    case "1y":  d.setFullYear(d.getFullYear() - 1); return d;
    case "all": return null;
  }
}

function decSum(txs: { amount: Prisma.Decimal }[]): Prisma.Decimal {
  return txs.reduce((s, t) => s.plus(t.amount), new Prisma.Decimal(0));
}

export async function getIncomeSummary(userId: string) {
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const allIncome = await prisma.walletTransaction.findMany({
    where: {
      userId,
      type:   { in: [...INCOME_TYPES] },
      status: "SUCCESS",
    },
    select: { type: true, amount: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const today = allIncome.filter(t => t.createdAt >= todayStart);
  const week  = allIncome.filter(t => t.createdAt >= weekStart);
  const month = allIncome.filter(t => t.createdAt >= monthStart);

  const lifetimeTotal = decSum(allIncome);

  const breakdown = INCOME_TYPES.map(type => {
    const typeTxs    = allIncome.filter(t => t.type === type);
    const total      = decSum(typeTxs);
    const todayAmt   = decSum(typeTxs.filter(t => t.createdAt >= todayStart));
    const weekAmt    = decSum(typeTxs.filter(t => t.createdAt >= weekStart));
    const pct        = lifetimeTotal.gt(0)
      ? total.div(lifetimeTotal).mul(100).toDecimalPlaces(1)
      : new Prisma.Decimal(0);
    return {
      type,
      total:      total.toFixed(2),
      today:      todayAmt.toFixed(2),
      week:       weekAmt.toFixed(2),
      percentage: pct.toFixed(1),
    };
  });

  // Analytics
  const largest = allIncome.reduce(
    (max, tx) => tx.amount.gt(max) ? tx.amount : max,
    new Prisma.Decimal(0),
  );

  const oldestTx = allIncome.length > 0 ? allIncome[allIncome.length - 1] : null;
  const daysSinceFirst = oldestTx
    ? Math.max(1, Math.ceil((now.getTime() - oldestTx.createdAt.getTime()) / 86_400_000))
    : 1;

  const avgDaily   = allIncome.length > 0 ? lifetimeTotal.div(daysSinceFirst) : new Prisma.Decimal(0);
  const avgMonthly = avgDaily.mul(30);

  const roiTotal     = decSum(allIncome.filter(t => t.type === "ROI_CLAIM"));
  const networkTotal = decSum(allIncome.filter(t => t.type !== "ROI_CLAIM"));
  const roiPct = lifetimeTotal.gt(0)
    ? roiTotal.div(lifetimeTotal).mul(100).toDecimalPlaces(1)
    : new Prisma.Decimal(0);
  const netPct = lifetimeTotal.gt(0)
    ? networkTotal.div(lifetimeTotal).mul(100).toDecimalPlaces(1)
    : new Prisma.Decimal(0);

  const highestSource = breakdown.reduce(
    (best, b) => parseFloat(b.total) > parseFloat(best.total) ? b : best,
    breakdown[0],
  );

  return {
    periods: {
      today:    decSum(today).toFixed(2),
      week:     decSum(week).toFixed(2),
      month:    decSum(month).toFixed(2),
      lifetime: lifetimeTotal.toFixed(2),
    },
    breakdown,
    analytics: {
      highestSource:     highestSource?.type ?? null,
      largestReward:     largest.toFixed(2),
      avgDailyIncome:    avgDaily.toFixed(2),
      avgMonthlyIncome:  avgMonthly.toFixed(2),
      roiVsNetworkRoi:   roiPct.toFixed(1),
      roiVsNetworkNet:   netPct.toFixed(1),
      totalTransactions: allIncome.length,
    },
  };
}

export async function getIncomeTrend(userId: string, period: TrendPeriod) {
  const start = getPeriodStart(period);

  const txs = await prisma.walletTransaction.findMany({
    where: {
      userId,
      type:   { in: [...INCOME_TYPES] },
      status: "SUCCESS",
      ...(start && { createdAt: { gte: start } }),
    },
    select: { createdAt: true, amount: true },
    orderBy: { createdAt: "asc" },
  });

  if (txs.length === 0) return [];

  // Group by date (ISO date string)
  const byDay = new Map<string, number>();
  for (const tx of txs) {
    const key = tx.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + parseFloat(tx.amount.toString()));
  }

  // Fill every calendar day in the period so chart has no gaps
  const from = start ?? txs[0].createdAt;
  const to   = new Date();
  const result: { date: string; total: number }[] = [];

  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, total: Math.round((byDay.get(key) ?? 0) * 100) / 100 });
  }

  return result;
}
