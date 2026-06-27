import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? parseFloat(d.toString()) : 0;
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function weeksAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Engine job names for job_execution_logs
const JOB_NAME: Record<string, string> = {
  roi:     "roi-engine",
  binary:  "binary-matching",
  orbit:   "binary-orbit",
  salary:  "salary-engine",
  level:   "level-income",
  release: "principal-release",
  notify:  "notification-engine",
};

// ─── Dashboard KPIs ─────────────────────────────────────────────────────────────

export async function getEngineDashboard() {
  const today = todayStart();

  const [roiAgg, binaryAgg, orbitAgg, levelAgg, salaryAgg, pendingReleases] = await Promise.all([
    prisma.roiLedger.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: today } },
    }),
    prisma.binaryMatchIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { createdAt: { gte: today } },
    }),
    prisma.binaryOrbitIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { createdAt: { gte: today } },
    }),
    prisma.levelIncome.aggregate({
      _sum: { incomeAmount: true },
      where: { createdAt: { gte: today } },
    }),
    prisma.salaryIncome.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: today } },
    }),
    prisma.investment.count({
      where: { status: "MATURED", claimablePrincipal: { gt: 0 } },
    }),
  ]);

  const todayRoi    = toNum(roiAgg._sum.amount);
  const todayBinary = toNum(binaryAgg._sum.incomeAmount);
  const todayOrbit  = toNum(orbitAgg._sum.incomeAmount);
  const todayLevel  = toNum(levelAgg._sum.incomeAmount);
  const todaySalary = toNum(salaryAgg._sum.amount);
  const todayTotal  = todayRoi + todayBinary + todayOrbit + todayLevel + todaySalary;

  // Derive active engines (engines with any income in last 7 days)
  const week = daysAgo(7);
  const [hasRoi, hasBinary, hasOrbit, hasLevel, hasSalary] = await Promise.all([
    prisma.roiLedger.count({ where: { createdAt: { gte: week } } }),
    prisma.binaryMatchIncome.count({ where: { createdAt: { gte: week } } }),
    prisma.binaryOrbitIncome.count({ where: { createdAt: { gte: week } } }),
    prisma.levelIncome.count({ where: { createdAt: { gte: week } } }),
    prisma.salaryIncome.count({ where: { createdAt: { gte: week } } }),
  ]);
  const activeEngines = [hasRoi, hasBinary, hasOrbit, hasLevel, hasSalary].filter(Boolean).length;
  // release + notify engines are always counted as active infrastructure
  const totalActive = activeEngines + 2;

  // Engine health: proportion of working engines (max 7)
  const totalEngines = 7;
  const failedJobCount = await prisma.jobExecutionLog.count({
    where: { status: "FAILED", startedAt: { gte: daysAgo(1) } },
  });
  const engineHealth = Math.max(0, Math.round(((totalEngines - Math.min(failedJobCount, totalEngines)) / totalEngines) * 100));

  return {
    todayTotal,
    todayRoi,
    todayBinary,
    todayOrbit,
    todayLevel,
    todaySalary,
    pendingReleases,
    activeEngines: totalActive,
    engineHealth,
  };
}

// ─── Per-engine stats helper ─────────────────────────────────────────────────────

async function deriveEngineStatus(jobName: string): Promise<"RUNNING" | "IDLE" | "PAUSED" | "ERROR"> {
  const latest = await prisma.jobExecutionLog.findFirst({
    where:   { jobName },
    orderBy: { createdAt: "desc" },
    select:  { status: true, startedAt: true },
  });
  if (!latest) return "IDLE";
  if (latest.status === "RUNNING") {
    const age = Date.now() - latest.startedAt.getTime();
    return age < 10 * 60 * 1000 ? "RUNNING" : "ERROR"; // RUNNING > 10 min → stuck
  }
  if (latest.status === "FAILED") return "ERROR";
  return "IDLE";
}

async function getJobStats(jobName: string) {
  const [successfulJobs, failedJobs, avgRow] = await Promise.all([
    prisma.jobExecutionLog.count({ where: { jobName, status: "SUCCESS" } }),
    prisma.jobExecutionLog.count({ where: { jobName, status: "FAILED" } }),
    prisma.jobExecutionLog.aggregate({
      where: { jobName, status: "SUCCESS", completedAt: { not: null } },
      _avg:  { recordsProcessed: true },
    }),
  ]);

  // avgRuntime in seconds from completedAt - startedAt via raw
  const runtimeRows = await prisma.$queryRaw<{ avg_s: number }[]>`
    SELECT EXTRACT(EPOCH FROM AVG("completedAt" - "startedAt"))::float AS avg_s
    FROM job_execution_logs
    WHERE "jobName" = ${jobName}
      AND status = 'SUCCESS'
      AND "completedAt" IS NOT NULL
  `;
  const avgRuntime = runtimeRows[0]?.avg_s ?? 0;

  const lastJob = await prisma.jobExecutionLog.findFirst({
    where:   { jobName },
    orderBy: { startedAt: "desc" },
    select:  { startedAt: true, completedAt: true },
  });

  return {
    successfulJobs,
    failedJobs,
    avgRuntime: Math.round(avgRuntime),
    avgRecordsProcessed: Math.round(avgRow._avg.recordsProcessed ?? 0),
    lastRun: lastJob?.startedAt ?? null,
  };
}

// ─── Engine-specific income aggregates ──────────────────────────────────────────

async function roiStats(from: Date) {
  const [agg, count] = await Promise.all([
    prisma.roiLedger.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: from } } }),
    prisma.roiLedger.count({ where: { createdAt: { gte: from } } }),
  ]);
  return { total: toNum(agg._sum.amount), records: count };
}

async function binaryStats(from: Date) {
  const [agg, count] = await Promise.all([
    prisma.binaryMatchIncome.aggregate({ _sum: { incomeAmount: true }, where: { createdAt: { gte: from } } }),
    prisma.binaryMatchIncome.count({ where: { createdAt: { gte: from } } }),
  ]);
  return { total: toNum(agg._sum.incomeAmount), records: count };
}

async function orbitStats(from: Date) {
  const [agg, count] = await Promise.all([
    prisma.binaryOrbitIncome.aggregate({ _sum: { incomeAmount: true }, where: { createdAt: { gte: from } } }),
    prisma.binaryOrbitIncome.count({ where: { createdAt: { gte: from } } }),
  ]);
  return { total: toNum(agg._sum.incomeAmount), records: count };
}

async function salaryStats(from: Date) {
  const [agg, count] = await Promise.all([
    prisma.salaryIncome.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: from } } }),
    prisma.salaryIncome.count({ where: { createdAt: { gte: from } } }),
  ]);
  return { total: toNum(agg._sum.amount), records: count };
}

async function levelStats(from: Date) {
  const [agg, count] = await Promise.all([
    prisma.levelIncome.aggregate({ _sum: { incomeAmount: true }, where: { createdAt: { gte: from } } }),
    prisma.levelIncome.count({ where: { createdAt: { gte: from } } }),
  ]);
  return { total: toNum(agg._sum.incomeAmount), records: count };
}

// Distinct beneficiaries (users who received income) for each engine
async function roiBeneficiaries(): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "userId") AS c FROM roi_ledger`;
  return Number(rows[0]?.c ?? 0);
}

async function binaryBeneficiaries(): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "userId") AS c FROM binary_match_income`;
  return Number(rows[0]?.c ?? 0);
}

async function orbitBeneficiaries(): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "userId") AS c FROM binary_orbit_income`;
  return Number(rows[0]?.c ?? 0);
}

async function salaryBeneficiaries(): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "userId") AS c FROM salary_income`;
  return Number(rows[0]?.c ?? 0);
}

async function levelBeneficiaries(): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(DISTINCT "receiverUserId") AS c FROM level_income`;
  return Number(rows[0]?.c ?? 0);
}

// Last income record timestamp for engines without explicit job logs
async function lastIncomeTimestamp(engineId: string): Promise<Date | null> {
  switch (engineId) {
    case "roi":    { const r = await prisma.roiLedger.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }); return r?.createdAt ?? null; }
    case "binary": { const r = await prisma.binaryMatchIncome.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }); return r?.createdAt ?? null; }
    case "orbit":  { const r = await prisma.binaryOrbitIncome.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }); return r?.createdAt ?? null; }
    case "salary": { const r = await prisma.salaryIncome.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }); return r?.createdAt ?? null; }
    case "level":  { const r = await prisma.levelIncome.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }); return r?.createdAt ?? null; }
    default: return null;
  }
}

// ─── Engine list ─────────────────────────────────────────────────────────────────

interface EngineListItem {
  id:             string;
  status:         "RUNNING" | "IDLE" | "PAUSED" | "ERROR";
  lastRun:        string | null;
  nextRun:        string | null;
  avgRuntime:     number;
  todayPayout:    number;
  weekPayout:     number;
  monthPayout:    number;
  beneficiaries:  number;
  successfulJobs: number;
  failedJobs:     number;
  adminNotes:     string;
  cpu:            number;
  memoryMB:       number;
  queueSize:      number;
  workers:        number;
  maxWorkers:     number;
  cronActive:     boolean;
  dbOk:           boolean;
}

async function getEngineNotes(engineId: string): Promise<string> {
  const row = await prisma.systemSettings.findUnique({ where: { key: `engine.${engineId}.notes` } });
  return row?.value ?? "";
}

export async function getEngineList(): Promise<{ engines: EngineListItem[] }> {
  const today = todayStart();
  const week  = daysAgo(7);
  const month = daysAgo(30);

  const ENGINE_IDS = ["roi", "binary", "orbit", "salary", "level", "release", "notify"] as const;

  const results = await Promise.all(
    ENGINE_IDS.map(async (id) => {
      const jobName = JOB_NAME[id];
      const [jobStatsData, status, notes] = await Promise.all([
        getJobStats(jobName),
        deriveEngineStatus(jobName),
        getEngineNotes(id),
      ]);

      // Income aggregates per engine
      let todayPayout = 0, weekPayout = 0, monthPayout = 0, beneficiaries = 0;

      if (id === "roi") {
        const [t, w, m, b] = await Promise.all([roiStats(today), roiStats(week), roiStats(month), roiBeneficiaries()]);
        todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
      } else if (id === "binary") {
        const [t, w, m, b] = await Promise.all([binaryStats(today), binaryStats(week), binaryStats(month), binaryBeneficiaries()]);
        todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
      } else if (id === "orbit") {
        const [t, w, m, b] = await Promise.all([orbitStats(today), orbitStats(week), orbitStats(month), orbitBeneficiaries()]);
        todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
      } else if (id === "salary") {
        const [t, w, m, b] = await Promise.all([salaryStats(today), salaryStats(week), salaryStats(month), salaryBeneficiaries()]);
        todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
      } else if (id === "level") {
        const [t, w, m, b] = await Promise.all([levelStats(today), levelStats(week), levelStats(month), levelBeneficiaries()]);
        todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
      }
      // release + notify: no income table → stay at 0

      // lastRun: prefer job log, fall back to last income timestamp
      let lastRun: string | null = null;
      if (jobStatsData.lastRun) {
        lastRun = jobStatsData.lastRun.toISOString();
      } else {
        const ts = await lastIncomeTimestamp(id);
        if (ts) lastRun = ts.toISOString();
      }

      // nextRun: compute next 00:00 or 12:00 UTC for scheduled engines
      const nextRunDate = computeNextRun(id);

      // queueSize: active investments for ROI, pending releases for release, etc.
      let queueSize = 0;
      if (id === "roi")     queueSize = await prisma.investment.count({ where: { status: "ACTIVE" } });
      if (id === "release") queueSize = await prisma.investment.count({ where: { status: "MATURED", claimablePrincipal: { gt: 0 } } });
      if (id === "notify")  queueSize = await prisma.notification.count({ where: { isRead: false } });

      const workerCount = (id === "notify" || id === "release") ? 1 : 1;
      const maxWorkers  = workerCount;

      return {
        id,
        status,
        lastRun,
        nextRun: nextRunDate ? nextRunDate.toISOString() : null,
        avgRuntime:     jobStatsData.avgRuntime,
        todayPayout,
        weekPayout,
        monthPayout,
        beneficiaries,
        successfulJobs: jobStatsData.successfulJobs,
        failedJobs:     jobStatsData.failedJobs,
        adminNotes:     notes,
        cpu:            0,
        memoryMB:       0,
        queueSize,
        workers:        workerCount,
        maxWorkers,
        cronActive:     status !== "PAUSED" && status !== "ERROR",
        dbOk:           true,
      } satisfies EngineListItem;
    }),
  );

  return { engines: results };
}

// Next scheduled run: binary/orbit run at 00:00 and 12:00 UTC; others at 00:00 UTC
function computeNextRun(engineId: string): Date | null {
  const now = new Date();
  const next = new Date(now);

  if (engineId === "binary" || engineId === "orbit") {
    const h = now.getUTCHours();
    if (h < 12) {
      next.setUTCHours(12, 0, 0, 0);
    } else {
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(0, 0, 0, 0);
    }
    return next;
  }

  if (engineId === "roi") {
    // Runs every 12 hours
    const h = now.getUTCHours();
    if (h < 12) {
      next.setUTCHours(12, 0, 0, 0);
    } else {
      next.setUTCDate(next.getUTCDate() + 1);
      next.setUTCHours(0, 0, 0, 0);
    }
    return next;
  }

  if (engineId === "salary") {
    // Monthly — first day of next month
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(1);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }

  // Others: daily at 00:00
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

// ─── Engine detail ────────────────────────────────────────────────────────────────

export interface EngineRunRow {
  id:               string;
  startedAt:        string;
  completedAt:      string;
  duration:         number;
  membersProcessed: number;
  totalPaid:        number;
  status:           "SUCCESS" | "PARTIAL" | "FAILED";
}

export interface RecentPayoutRow {
  id:         string;
  username:   string;
  incomeType: string;
  amount:     number;
  timestamp:  string;
  status:     "PAID";
}

export interface EngineWarningRow {
  id:       string;
  type:     string;
  message:  string;
  severity: "warn" | "error";
}

export interface EngineAuditRow {
  id:        string;
  timestamp: string;
  admin:     string;
  action:    string;
  detail:    string;
}

async function getRunHistory(jobName: string): Promise<EngineRunRow[]> {
  const logs = await prisma.jobExecutionLog.findMany({
    where:   { jobName },
    orderBy: { startedAt: "desc" },
    take:    20,
  });

  return logs.map(log => ({
    id:               log.id,
    startedAt:        log.startedAt.toISOString(),
    completedAt:      (log.completedAt ?? log.startedAt).toISOString(),
    duration:         log.completedAt
      ? Math.round((log.completedAt.getTime() - log.startedAt.getTime()) / 1000)
      : 0,
    membersProcessed: log.recordsProcessed ?? 0,
    totalPaid:        0, // not stored in job_execution_logs
    status:           log.status === "FAILED" ? "FAILED" : log.status === "RUNNING" ? "PARTIAL" : "SUCCESS",
  }));
}

async function getRecentPayouts(engineId: string): Promise<RecentPayoutRow[]> {
  const label: Record<string, string> = {
    roi: "ROI", binary: "Binary Match", orbit: "Binary Orbit",
    salary: "Salary", level: "Level Income",
  };
  const typeName = label[engineId] ?? engineId;

  switch (engineId) {
    case "roi": {
      const rows = await prisma.roiLedger.findMany({
        orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, amount: true, createdAt: true, userId: true },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: rows.map(r => r.userId) } },
        select: { id: true, username: true },
      });
      const um = new Map(users.map(u => [u.id, u.username]));
      return rows.map(r => ({
        id: r.id, username: um.get(r.userId) ?? r.userId,
        incomeType: typeName, amount: toNum(r.amount),
        timestamp: r.createdAt.toISOString(), status: "PAID",
      }));
    }
    case "binary": {
      const rows = await prisma.binaryMatchIncome.findMany({
        orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, incomeAmount: true, createdAt: true, userId: true },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: rows.map(r => r.userId) } },
        select: { id: true, username: true },
      });
      const um = new Map(users.map(u => [u.id, u.username]));
      return rows.map(r => ({
        id: r.id, username: um.get(r.userId) ?? r.userId,
        incomeType: typeName, amount: toNum(r.incomeAmount),
        timestamp: r.createdAt.toISOString(), status: "PAID",
      }));
    }
    case "orbit": {
      const rows = await prisma.binaryOrbitIncome.findMany({
        orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, incomeAmount: true, createdAt: true, userId: true },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: rows.map(r => r.userId) } },
        select: { id: true, username: true },
      });
      const um = new Map(users.map(u => [u.id, u.username]));
      return rows.map(r => ({
        id: r.id, username: um.get(r.userId) ?? r.userId,
        incomeType: typeName, amount: toNum(r.incomeAmount),
        timestamp: r.createdAt.toISOString(), status: "PAID",
      }));
    }
    case "salary": {
      const rows = await prisma.salaryIncome.findMany({
        orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, amount: true, createdAt: true, userId: true },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: rows.map(r => r.userId) } },
        select: { id: true, username: true },
      });
      const um = new Map(users.map(u => [u.id, u.username]));
      return rows.map(r => ({
        id: r.id, username: um.get(r.userId) ?? r.userId,
        incomeType: typeName, amount: toNum(r.amount),
        timestamp: r.createdAt.toISOString(), status: "PAID",
      }));
    }
    case "level": {
      const rows = await prisma.levelIncome.findMany({
        orderBy: { createdAt: "desc" }, take: 20,
        select: { id: true, incomeAmount: true, createdAt: true, receiverUserId: true },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: rows.map(r => r.receiverUserId) } },
        select: { id: true, username: true },
      });
      const um = new Map(users.map(u => [u.id, u.username]));
      return rows.map(r => ({
        id: r.id, username: um.get(r.receiverUserId) ?? r.receiverUserId,
        incomeType: typeName, amount: toNum(r.incomeAmount),
        timestamp: r.createdAt.toISOString(), status: "PAID",
      }));
    }
    default:
      return [];
  }
}

async function buildWarnings(engineId: string, failedJobs: number, lastRun: string | null): Promise<EngineWarningRow[]> {
  const warnings: EngineWarningRow[] = [];
  if (failedJobs > 0) {
    warnings.push({
      id:       `${engineId}-failed-jobs`,
      type:     "Failed Executions Detected",
      message:  `${failedJobs} execution${failedJobs > 1 ? "s" : ""} of this engine failed. Review logs and check for data issues.`,
      severity: "error",
    });
  }
  if (!lastRun) {
    warnings.push({
      id:       `${engineId}-no-run`,
      type:     "No Execution History",
      message:  "This engine has not run recently or has no recorded execution history in the system.",
      severity: "warn",
    });
  }
  return warnings;
}

async function getEngineAuditLog(engineId: string): Promise<EngineAuditRow[]> {
  // Query admin logs that reference this engine (saved with details.engineId)
  const logs = await prisma.$queryRaw<{
    id: string; createdAt: Date; action: string; details: Record<string, unknown> | null;
    adminEmail: string | null;
  }[]>`
    SELECT al.id, al."createdAt", al.action, al.details, a.email AS "adminEmail"
    FROM admin_logs al
    JOIN admins a ON a.id = al."adminId"
    WHERE al.details->>'engineId' = ${engineId}
    ORDER BY al."createdAt" DESC
    LIMIT 30
  `;

  return logs.map(l => ({
    id:        l.id,
    timestamp: l.createdAt.toISOString(),
    admin:     l.adminEmail ?? "system",
    action:    l.action,
    detail:    String((l.details as Record<string, unknown>)?.detail ?? ""),
  }));
}

export async function getEngineDetail(engineId: string) {
  const jobName   = JOB_NAME[engineId] ?? engineId;
  const [jobStatsData, status, notes] = await Promise.all([
    getJobStats(jobName),
    deriveEngineStatus(jobName),
    getEngineNotes(engineId),
  ]);

  // payout stats
  const today = todayStart();
  const week  = daysAgo(7);
  const month = daysAgo(30);

  let todayPayout = 0, weekPayout = 0, monthPayout = 0, beneficiaries = 0;
  if (engineId === "roi") {
    const [t, w, m, b] = await Promise.all([roiStats(today), roiStats(week), roiStats(month), roiBeneficiaries()]);
    todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
  } else if (engineId === "binary") {
    const [t, w, m, b] = await Promise.all([binaryStats(today), binaryStats(week), binaryStats(month), binaryBeneficiaries()]);
    todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
  } else if (engineId === "orbit") {
    const [t, w, m, b] = await Promise.all([orbitStats(today), orbitStats(week), orbitStats(month), orbitBeneficiaries()]);
    todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
  } else if (engineId === "salary") {
    const [t, w, m, b] = await Promise.all([salaryStats(today), salaryStats(week), salaryStats(month), salaryBeneficiaries()]);
    todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
  } else if (engineId === "level") {
    const [t, w, m, b] = await Promise.all([levelStats(today), levelStats(week), levelStats(month), levelBeneficiaries()]);
    todayPayout = t.total; weekPayout = w.total; monthPayout = m.total; beneficiaries = b;
  }

  let lastRun: string | null = null;
  if (jobStatsData.lastRun) {
    lastRun = jobStatsData.lastRun.toISOString();
  } else {
    const ts = await lastIncomeTimestamp(engineId);
    if (ts) lastRun = ts.toISOString();
  }

  let queueSize = 0;
  if (engineId === "roi")     queueSize = await prisma.investment.count({ where: { status: "ACTIVE" } });
  if (engineId === "release") queueSize = await prisma.investment.count({ where: { status: "MATURED", claimablePrincipal: { gt: 0 } } });
  if (engineId === "notify")  queueSize = await prisma.notification.count({ where: { isRead: false } });

  const nextRunDate = computeNextRun(engineId);

  const [runHistory, recentPayouts, auditLog, warnings] = await Promise.all([
    getRunHistory(jobName),
    getRecentPayouts(engineId),
    getEngineAuditLog(engineId),
    buildWarnings(engineId, jobStatsData.failedJobs, lastRun),
  ]);

  return {
    id:             engineId,
    status,
    lastRun,
    nextRun:        nextRunDate ? nextRunDate.toISOString() : null,
    avgRuntime:     jobStatsData.avgRuntime,
    todayPayout,
    weekPayout,
    monthPayout,
    beneficiaries,
    successfulJobs: jobStatsData.successfulJobs,
    failedJobs:     jobStatsData.failedJobs,
    adminNotes:     notes,
    cpu:            0,
    memoryMB:       0,
    queueSize,
    workers:        1,
    maxWorkers:     1,
    cronActive:     status !== "PAUSED" && status !== "ERROR",
    dbOk:           true,
    runHistory,
    recentPayouts,
    warnings,
    auditLog,
  };
}

// ─── Save admin notes ─────────────────────────────────────────────────────────────

export async function saveEngineNotes(
  engineId:  string,
  notes:     string,
  adminId:   string,
  adminEmail: string,
) {
  await prisma.systemSettings.upsert({
    where:  { key: `engine.${engineId}.notes` },
    update: { value: notes },
    create: { key: `engine.${engineId}.notes`, value: notes, description: `Admin notes for ${engineId} engine` },
  });

  // Write admin log so it appears in the audit trail
  await prisma.adminLog.create({
    data: {
      adminId,
      action: "ENGINE_NOTES_UPDATED",
      details: {
        engineId,
        detail: `Admin notes updated for ${engineId} engine.`,
      } as Prisma.InputJsonValue,
    },
  });

  return { engineId, notes };
}

// ─── Release queue ────────────────────────────────────────────────────────────────

export async function getReleaseQueue() {
  const matured = await prisma.investment.findMany({
    where:   { status: "MATURED", claimablePrincipal: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take:    10,
    select:  { id: true, claimablePrincipal: true, maturesAt: true, userId: true, updatedAt: true },
  });

  const userIds = [...new Set(matured.map(m => m.userId))];
  const users = await prisma.user.findMany({
    where:  { id: { in: userIds } },
    select: { id: true, username: true },
  });
  const um = new Map(users.map(u => [u.id, u.username]));

  const now = Date.now();
  const items = matured.map(m => {
    const elapsed = Math.floor((now - (m.maturesAt ?? m.updatedAt).getTime()) / 3600000);
    const hoursElapsed = Math.max(0, elapsed);
    const status: "PROCESSING" | "COMPLETED" | "PENDING" =
      hoursElapsed >= 72 ? "COMPLETED" : hoursElapsed >= 48 ? "PROCESSING" : "PENDING";
    return {
      id:           m.id,
      username:     um.get(m.userId) ?? m.userId,
      amount:       toNum(m.claimablePrincipal),
      hoursElapsed: Math.min(hoursElapsed, 72),
      status,
    };
  });

  return { items };
}
