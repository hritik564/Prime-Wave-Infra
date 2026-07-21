/**
 * Sprint 33J — Salary Export Service
 *
 * Generates CSV exports for payroll data.
 * Returns CSV strings (no file I/O — callers stream or save as needed).
 *
 * Exports:
 *   exportPayrollSummaryCSV(month, year)     One row: run-level summary.
 *   exportPayrollDetailCSV(month, year)      One row per SalaryIncome record.
 *   exportMemberHistoryCSV(userId)           One row per member salary record.
 *   exportRankDistributionCSV(month, year)   One row per rank.
 *
 * Future PDF support: replace the CSV builder with a PDF renderer in each
 * export function while keeping the data-fetch layer unchanged.
 */

import { logger } from "../lib/logger";
import {
  getMonthlyPayroll,
  getMemberSalaryHistory,
  getRankDistribution,
  getPayrollTotals,
} from "./salary-report.service";

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      // Quote cells that contain commas, quotes, or newlines
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

function buildCsv(
  headers: string[],
  rows:    (string | number | null | undefined)[][],
): string {
  const lines = [csvRow(headers), ...rows.map(csvRow)];
  return lines.join("\n");
}

// ── Payroll summary export ────────────────────────────────────────────────────

/**
 * Returns a CSV string with one summary row for the given month's payroll.
 */
export async function exportPayrollSummaryCSV(month: number, year: number): Promise<string> {
  logger.info({ month, year }, "salary-export: generating payroll summary CSV");

  const totals = await getPayrollTotals(month, year);
  const { run }  = await getMonthlyPayroll(month, year);

  const runRow = run as Record<string, unknown> | null;

  const headers = [
    "Year",
    "Month",
    "Run Status",
    "Members",
    "Total Payroll (USD)",
    "Average Salary (USD)",
    "Highest Salary (USD)",
    "Lowest Salary (USD)",
    "Pending",
    "Approved",
    "Paid",
  ];

  const rows: (string | number | null | undefined)[][] = [[
    year,
    month,
    (runRow?.status as string | undefined) ?? "N/A",
    totals.memberCount,
    totals.totalPayroll.toFixed(2),
    totals.averageSalary.toFixed(2),
    totals.highestSalary.toFixed(2),
    totals.lowestSalary.toFixed(2),
    totals.pendingCount,
    totals.approvedCount,
    totals.paidCount,
  ]];

  const csv = buildCsv(headers, rows);
  logger.info({ month, year }, "salary-export: payroll summary CSV generated");
  return csv;
}

// ── Payroll detail export ─────────────────────────────────────────────────────

/**
 * Returns a CSV string with one row per SalaryIncome record for the month.
 */
export async function exportPayrollDetailCSV(month: number, year: number): Promise<string> {
  logger.info({ month, year }, "salary-export: generating payroll detail CSV");

  const { incomes } = await getMonthlyPayroll(month, year);

  const headers = [
    "Income ID",
    "User ID",
    "Rank",
    "Amount (USD)",
    "Status",
    "Created At",
  ];

  const rows = incomes.map((i) => [
    i.id,
    i.userId,
    i.rankName,
    i.amount.toFixed(2),
    i.status,
    i.createdAt instanceof Date ? i.createdAt.toISOString() : String(i.createdAt),
  ]);

  const csv = buildCsv(headers, rows);
  logger.info({ month, year, rowCount: rows.length }, "salary-export: payroll detail CSV generated");
  return csv;
}

// ── Member history export ─────────────────────────────────────────────────────

/**
 * Returns a CSV string with the full salary history for a single member.
 */
export async function exportMemberHistoryCSV(userId: string): Promise<string> {
  logger.info({ userId }, "salary-export: generating member history CSV");

  const records = await getMemberSalaryHistory(userId);

  const headers = [
    "Income ID",
    "Year",
    "Month",
    "Rank",
    "Amount (USD)",
    "Status",
    "Approved At",
    "Paid At",
    "Transaction ID",
    "Created At",
  ];

  const rows = records.map((r) => [
    r.id,
    r.year,
    r.month,
    r.rankName,
    r.amount.toFixed(2),
    r.status,
    r.approvedAt ? r.approvedAt.toISOString() : null,
    r.paidAt     ? r.paidAt.toISOString()     : null,
    r.transactionId ?? null,
    r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  ]);

  const csv = buildCsv(headers, rows);
  logger.info({ userId, rowCount: rows.length }, "salary-export: member history CSV generated");
  return csv;
}

// ── Rank distribution export ──────────────────────────────────────────────────

/**
 * Returns a CSV string with one row per rank showing count and total payout.
 */
export async function exportRankDistributionCSV(month: number, year: number): Promise<string> {
  logger.info({ month, year }, "salary-export: generating rank distribution CSV");

  const distribution = await getRankDistribution(month, year);

  const headers = ["Rank", "Member Count", "Total Payout (USD)"];

  const rows = distribution.map((d) => [
    d.rankName,
    d.count,
    d.total.toFixed(2),
  ]);

  const csv = buildCsv(headers, rows);
  logger.info({ month, year, rankCount: rows.length }, "salary-export: rank distribution CSV generated");
  return csv;
}
