import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import type { DateRangeQuery, TopListQuery, PaginatedDateRange } from "./reports.schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function thirtyDaysAgo(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(23, 59, 59, 999);
  return r;
}

// ── Revenue report ────────────────────────────────────────────────────────────

export async function getRevenueReport(q: DateRangeQuery) {
  const from = q.from ?? thirtyDaysAgo();
  const to   = q.to   ? endOfDay(q.to) : new Date();

  const dateFilter = (col: string) => ({
    gte: from,
    lte: to,
  });

  const [
    depositsAgg, withdrawalsAgg,
    roiAgg, binaryAgg, orbitAgg, levelAgg, salaryAgg,
  ] = await prisma.$transaction([
    prisma.depositRequest.aggregate({
      _sum: { amount: true },
      where: { status: "APPROVED", approvedAt: dateFilter("approvedAt") },
    }),
    prisma.withdrawalRequest.aggregate({
      _sum: { amount: true },
      where: { status: "COMPLETED", completedAt: dateFilter("completedAt") },
    }),
    prisma.roiLedger.aggregate({
      _sum: { amount: true },
      where: { createdAt: dateFilter("createdAt") },
    }),
    prisma.binaryMatchIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { createdAt: dateFilter("createdAt") },
    }),
    prisma.binaryOrbitIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { createdAt: dateFilter("createdAt") },
    }),
    prisma.levelIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { createdAt: dateFilter("createdAt") },
    }),
    prisma.salaryIncome.aggregate({
      _sum: { amount: true },
      where: { createdAt: dateFilter("createdAt") },
    }),
  ]);

  const totalDeposits    = depositsAgg._sum.amount       ?? new Prisma.Decimal(0);
  const totalWithdrawals = withdrawalsAgg._sum.amount    ?? new Prisma.Decimal(0);
  const roiPaid          = roiAgg._sum.amount            ?? new Prisma.Decimal(0);
  const binaryPaid       = binaryAgg._sum.incomeAmount   ?? new Prisma.Decimal(0);
  const orbitPaid        = orbitAgg._sum.incomeAmount    ?? new Prisma.Decimal(0);
  const levelPaid        = levelAgg._sum.incomeAmount    ?? new Prisma.Decimal(0);
  const salaryPaid       = salaryAgg._sum.amount         ?? new Prisma.Decimal(0);

  return {
    period: { from, to },
    totalDeposits,
    totalWithdrawals,
    netCashflow: totalDeposits.sub(totalWithdrawals),
    roiPaid,
    binaryPaid,
    orbitPaid,
    levelPaid,
    salaryPaid,
    totalDistributed: roiPaid.add(binaryPaid).add(orbitPaid).add(levelPaid).add(salaryPaid),
  };
}

// ── Daily business report ─────────────────────────────────────────────────────

interface DailyRow { date: Date; count: bigint }

export async function getDailyBusinessReport(q: PaginatedDateRange) {
  const from = q.from ?? thirtyDaysAgo();
  const to   = q.to   ? endOfDay(q.to) : new Date();

  const [newUsers, deposits, investments, withdrawals] = await prisma.$transaction([
    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_TRUNC('day', "createdAt") AS date, COUNT(*)::bigint AS count
      FROM users
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1 ORDER BY 1`,

    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_TRUNC('day', "approvedAt") AS date, COUNT(*)::bigint AS count
      FROM deposit_requests
      WHERE status = 'APPROVED' AND "approvedAt" >= ${from} AND "approvedAt" <= ${to}
      GROUP BY 1 ORDER BY 1`,

    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_TRUNC('day', "createdAt") AS date, COUNT(*)::bigint AS count
      FROM investments
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
      GROUP BY 1 ORDER BY 1`,

    prisma.$queryRaw<DailyRow[]>`
      SELECT DATE_TRUNC('day', "completedAt") AS date, COUNT(*)::bigint AS count
      FROM withdrawal_requests
      WHERE status = 'COMPLETED' AND "completedAt" >= ${from} AND "completedAt" <= ${to}
      GROUP BY 1 ORDER BY 1`,
  ]);

  // Merge by ISO-date key
  const byDate: Record<string, { date: string; newUsers: number; deposits: number; investments: number; withdrawals: number }> = {};

  const ensureDay = (d: Date) => {
    const key = d.toISOString().substring(0, 10);
    if (!byDate[key]) byDate[key] = { date: key, newUsers: 0, deposits: 0, investments: 0, withdrawals: 0 };
    return key;
  };

  for (const r of newUsers)     byDate[ensureDay(r.date)].newUsers    = Number(r.count);
  for (const r of deposits)     byDate[ensureDay(r.date)].deposits    = Number(r.count);
  for (const r of investments)  byDate[ensureDay(r.date)].investments = Number(r.count);
  for (const r of withdrawals)  byDate[ensureDay(r.date)].withdrawals = Number(r.count);

  return {
    period: { from, to },
    data:   Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ── Top earners ───────────────────────────────────────────────────────────────

interface EarnerRow {
  id:          string;
  username:    string;
  totalIncome: string;   // Prisma raw returns Decimal/numeric as string
}

export async function getTopEarners(q: TopListQuery) {
  const limit = q.limit;
  const rows = await prisma.$queryRaw<EarnerRow[]>`
    WITH totals AS (
      SELECT
        u.id,
        u.username,
        (
          COALESCE((SELECT SUM(amount)         FROM roi_ledger          WHERE "userId"         = u.id), 0) +
          COALESCE((SELECT SUM("incomeAmount")  FROM binary_match_income WHERE "userId"         = u.id), 0) +
          COALESCE((SELECT SUM("incomeAmount")  FROM binary_orbit_income WHERE "userId"         = u.id), 0) +
          COALESCE((SELECT SUM("incomeAmount")  FROM level_income         WHERE "receiverUserId" = u.id), 0) +
          COALESCE((SELECT SUM(amount)          FROM salary_income        WHERE "userId"         = u.id), 0)
        ) AS "totalIncome"
      FROM users u
    )
    SELECT id, username, "totalIncome"
    FROM totals
    WHERE "totalIncome" > 0
    ORDER BY "totalIncome" DESC
    LIMIT ${limit}`;

  return rows.map((r) => ({ id: r.id, username: r.username, totalIncome: r.totalIncome }));
}

// ── Top sponsors ──────────────────────────────────────────────────────────────

interface SponsorRow {
  id:                 string;
  username:           string;
  directReferrals:    number;
  teamSize:           number;
  totalTeamBusiness:  string;
}

export async function getTopSponsors(q: TopListQuery) {
  const limit = q.limit;
  const rows = await prisma.$queryRaw<SponsorRow[]>`
    WITH RECURSIVE tree(ancestor_id, descendant_id) AS (
      SELECT "sponsorId" AS ancestor_id, id AS descendant_id
      FROM users WHERE "sponsorId" IS NOT NULL
      UNION ALL
      SELECT t.ancestor_id, u.id AS descendant_id
      FROM users u
      INNER JOIN tree t ON u."sponsorId" = t.descendant_id
    ),
    team_stats AS (
      SELECT
        t.ancestor_id                               AS sponsor_id,
        COUNT(DISTINCT t.descendant_id)::int        AS team_size,
        COALESCE(SUM(i.amount), 0)                  AS total_team_business
      FROM tree t
      LEFT JOIN investments i
        ON i."userId" = t.descendant_id
      GROUP BY t.ancestor_id
    )
    SELECT
      u.id,
      u.username,
      u."directReferralCount"                       AS "directReferrals",
      COALESCE(ts.team_size, 0)                     AS "teamSize",
      COALESCE(ts.total_team_business, 0)           AS "totalTeamBusiness"
    FROM users u
    INNER JOIN team_stats ts ON ts.sponsor_id = u.id
    ORDER BY ts.total_team_business DESC
    LIMIT ${limit}`;

  return rows.map((r) => ({
    id:                r.id,
    username:          r.username,
    directReferrals:   Number(r.directReferrals),
    teamSize:          Number(r.teamSize),
    totalTeamBusiness: r.totalTeamBusiness,
  }));
}

// ── Rank distribution ─────────────────────────────────────────────────────────

export async function getRankDistribution() {
  const rows = await prisma.salaryAchievement.groupBy({
    by:      ["rankName"],
    _count:  { userId: true },
    orderBy: { _count: { userId: "desc" } },
  });

  return rows.map((r) => ({
    rankName:  r.rankName,
    userCount: r._count.userId,
  }));
}

// ── Network distribution ──────────────────────────────────────────────────────

export async function getNetworkDistribution(q: DateRangeQuery) {
  const from = q.from ?? thirtyDaysAgo();
  const to   = q.to   ? endOfDay(q.to) : new Date();

  const rows = await prisma.depositRequest.groupBy({
    by:      ["network"],
    _count:  { id: true },
    where:   { status: "APPROVED", approvedAt: { gte: from, lte: to } },
    orderBy: { _count: { id: "desc" } },
  });

  const total = rows.reduce((s, r) => s + r._count.id, 0);

  return {
    period: { from, to },
    total,
    networks: rows.map((r) => ({
      network:    r.network,
      count:      r._count.id,
      percentage: total > 0 ? +((r._count.id / total) * 100).toFixed(2) : 0,
    })),
  };
}

// ── Pending operations ────────────────────────────────────────────────────────

export async function getPendingOperations() {
  const [pendingDeposits, pendingWithdrawals, failedJobs] =
    await prisma.$transaction([
      prisma.depositRequest.count({ where: { status: "PENDING" } }),
      prisma.withdrawalRequest.count({ where: { status: "PENDING" } }),
      prisma.jobExecutionLog.count({ where: { status: "FAILED" } }),
    ]);

  return { pendingDeposits, pendingWithdrawals, failedJobs };
}

// ── System risk report ────────────────────────────────────────────────────────

export async function getRiskReport() {
  const [depositsAgg, withdrawalsAgg, pendingWithdrawalsAgg, claimableRoiAgg] =
    await prisma.$transaction([
      prisma.depositRequest.aggregate({
        _sum: { amount: true },
        where: { status: "APPROVED" },
      }),
      prisma.withdrawalRequest.aggregate({
        _sum: { amount: true },
        where: { status: "COMPLETED" },
      }),
      prisma.withdrawalRequest.aggregate({
        _sum: { amount: true },
        where: { status: { in: ["PENDING", "APPROVED"] } },
      }),
      prisma.investment.aggregate({
        _sum: { claimableROI: true },
        where: { status: "ACTIVE" },
      }),
    ]);

  const cashIn             = depositsAgg._sum.amount             ?? new Prisma.Decimal(0);
  const cashOut            = withdrawalsAgg._sum.amount          ?? new Prisma.Decimal(0);
  const pendingWithdrawals = pendingWithdrawalsAgg._sum.amount   ?? new Prisma.Decimal(0);
  const claimableRoi       = claimableRoiAgg._sum.claimableROI   ?? new Prisma.Decimal(0);

  return {
    cashIn,
    cashOut,
    netReserve:          cashIn.sub(cashOut),
    pendingLiabilities:  pendingWithdrawals.add(claimableRoi),
    breakdown: {
      pendingWithdrawals,
      unclaimedRoi: claimableRoi,
    },
  };
}

// ── User income summary ───────────────────────────────────────────────────────

export async function getUserIncomeSummary(userId: string) {
  const [roi, binary, orbit, level, salary] = await prisma.$transaction([
    prisma.roiLedger.aggregate({
      _sum: { amount: true },
      where: { userId },
    }),
    prisma.binaryMatchIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { userId },
    }),
    prisma.binaryOrbitIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { userId },
    }),
    prisma.levelIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { receiverUserId: userId },
    }),
    prisma.salaryIncome.aggregate({
      _sum: { amount: true },
      where: { userId },
    }),
  ]);

  const roiIncome    = roi._sum.amount           ?? new Prisma.Decimal(0);
  const binaryIncome = binary._sum.incomeAmount  ?? new Prisma.Decimal(0);
  const orbitIncome  = orbit._sum.incomeAmount   ?? new Prisma.Decimal(0);
  const levelIncome  = level._sum?.incomeAmount  ?? new Prisma.Decimal(0);
  const salaryIncome = salary._sum.amount        ?? new Prisma.Decimal(0);

  return {
    userId,
    roiIncome,
    binaryIncome,
    orbitIncome,
    levelIncome,
    salaryIncome,
    totalIncome: roiIncome.add(binaryIncome).add(orbitIncome).add(levelIncome).add(salaryIncome),
  };
}
