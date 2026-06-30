/**
 * Financial Transparency Service — READ ONLY
 *
 * Aggregates schedule metadata from existing DB records.
 * NEVER executes financial engines or modifies state.
 * Exposes only:
 *   - Next & last run times per engine (from job_execution_logs)
 *   - Engine enable/disable flags (from system_settings)
 */

import { prisma } from "../config/prisma";
import { APP_TIMEZONE } from "../config/timezone";

// ── Schedule helpers (adapted from cron/index.ts, read-only copies) ───────────

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

/** ISO string of the next 00:00 or 12:00 London boundary (ROI / binary / orbit). */
function nextLondonBoundaryISO(now: Date): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const londonHour   = get("hour");
  const londonMinute = get("minute");
  const londonSecond = get("second");
  const secondsIntoDay  = londonHour * 3_600 + londonMinute * 60 + londonSecond;
  const secondsUntil    = londonHour < 12
    ? 12 * 3_600 - secondsIntoDay
    : 24 * 3_600 - secondsIntoDay;
  return new Date(now.getTime() + secondsUntil * 1_000).toISOString();
}

/** ISO string of the next 1st-of-month midnight in London (salary). */
function nextMonthStartISO(now: Date): string {
  const london = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = london.formatToParts(now);
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
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

/** ISO string of the next full-hour boundary (income transfer engine). */
function nextHourISO(now: Date): string {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.toISOString();
}

// ── Main aggregator ───────────────────────────────────────────────────────────

export async function getFinancialTransparencyData() {
  const now = new Date();

  const [jobLogs, settings] = await Promise.all([
    // Most recent SUCCESS log per engine
    prisma.jobExecutionLog.findMany({
      where: {
        jobName: { in: ["roi-engine", "binary-matching", "binary-orbit", "salary-engine"] },
        status: "SUCCESS",
      },
      orderBy: { completedAt: "desc" },
      select:  { jobName: true, completedAt: true },
      distinct: ["jobName"],
    }),

    // Engine enable/disable flags
    prisma.systemSettings.findMany({
      where: { key: { in: ["gl.roi_engine", "gl.salary_engine", "gl.binary_matching", "gl.level_income"] } },
      select: { key: true, value: true },
    }),
  ]);

  const lastRun = (name: string): string | null =>
    jobLogs.find((l: { jobName: string; completedAt: Date | null }) => l.jobName === name)?.completedAt?.toISOString() ?? null;

  const flag = (key: string): boolean => {
    const s = settings.find((s: { key: string; value: string }) => s.key === key);
    if (!s) return true; // default enabled if not set
    const v = String(s.value).trim().toLowerCase();
    return v !== "false" && v !== "0";
  };

  const nextBoundary = nextLondonBoundaryISO(now);

  return {
    fetchedAt: now.toISOString(),
    schedule: {
      roi:            { nextRunAt: nextBoundary,       lastRunAt: lastRun("roi-engine")       },
      binary:         { nextRunAt: nextBoundary,       lastRunAt: lastRun("binary-matching")  },
      orbit:          { nextRunAt: nextBoundary,       lastRunAt: lastRun("binary-orbit")     },
      salary:         { nextRunAt: nextMonthStartISO(now), lastRunAt: lastRun("salary-engine") },
      incomeTransfer: { nextRunAt: nextHourISO(now) },
    },
    engineFlags: {
      roiEnabled:         flag("gl.roi_engine"),
      binaryEnabled:      flag("gl.binary_matching"),
      salaryEnabled:      flag("gl.salary_engine"),
      levelIncomeEnabled: flag("gl.level_income"),
    },
  };
}

export type FinancialTransparencyData = Awaited<ReturnType<typeof getFinancialTransparencyData>>;
