import ExcelJS from "exceljs";
import type { mapMemberRow } from "./member-reports.service";
import type { MemberExportQuery } from "./member-reports.schema";

type MemberRow = ReturnType<typeof mapMemberRow>;

const HEADERS = [
  "Name", "Username", "Email", "Phone", "Joined Date",
  "Account Type", "Sponsor", "Binary Parent", "Placement (L/R)",
  "Account Status", "Operational Status", "Investment Plan", "Investment Amount ($)",
  "Deposit Wallet ($)", "Income Wallet ($)", "Withdrawal Wallet ($)",
  "Direct Referrals", "Left BV", "Right BV",
];

function describeFilters(q: MemberExportQuery): string {
  const parts: string[] = [];
  if (q.preset)             parts.push(`Preset: ${q.preset}`);
  if (q.from)               parts.push(`From: ${q.from.toDateString()}`);
  if (q.to)                 parts.push(`To: ${q.to.toDateString()}`);
  if (q.status)             parts.push(`Account Status: ${q.status}`);
  if (q.operationalStatus)  parts.push(`Operational Status: ${q.operationalStatus}`);
  if (q.hasInvestment)      parts.push(`Investment: ${q.hasInvestment === "yes" ? "Has Investment" : "No Plan"}`);
  if (q.placement)          parts.push(`Placement: ${q.placement}`);
  if (q.accountType)        parts.push(`Account Type: ${q.accountType}`);
  if (q.search)             parts.push(`Search: "${q.search}"`);
  return parts.length ? parts.join("  |  ") : "All members (no filters applied)";
}

export async function buildMemberExcel(rows: MemberRow[], q: MemberExportQuery): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "Prime Wave Admin";
  wb.created  = new Date();

  const ws = wb.addWorksheet("Members Report");

  // ── Row 1: Title ──────────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = ws.getCell("A1");
  titleCell.value = "PrimeWave Member Report";
  titleCell.font  = { bold: true, size: 16, color: { argb: "FFD4AF37" } };
  titleCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E1B37" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  // ── Row 2: Generated date/time ────────────────────────────────────────────
  ws.mergeCells(2, 1, 2, HEADERS.length);
  const dateCell = ws.getCell("A2");
  dateCell.value = `Generated: ${new Date().toLocaleString("en-US", { timeZone: "UTC", dateStyle: "full", timeStyle: "medium" })} UTC`;
  dateCell.font  = { italic: true, size: 10, color: { argb: "FFAAB3C5" } };
  dateCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E1B37" } };
  dateCell.alignment = { horizontal: "center" };

  // ── Row 3: Applied filters ────────────────────────────────────────────────
  ws.mergeCells(3, 1, 3, HEADERS.length);
  const filterCell = ws.getCell("A3");
  filterCell.value = `Filters: ${describeFilters(q)}`;
  filterCell.font  = { size: 10, color: { argb: "FFAAB3C5" } };
  filterCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E1B37" } };
  filterCell.alignment = { horizontal: "left" };

  // Blank row 4
  ws.getRow(4).height = 6;

  // ── Row 5: Column headers ─────────────────────────────────────────────────
  const headerRow = ws.getRow(5);
  headerRow.values = ["", ...HEADERS]; // column 1 is 1-indexed with empty prefix
  // fix: exceljs row.values is 1-indexed
  headerRow.values = HEADERS;
  HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font  = { bold: true, size: 11, color: { argb: "FF0E1B37" } };
    cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4AF37" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF0E1B37" } },
    };
  });
  headerRow.height = 20;

  // Freeze header row
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 5, topLeftCell: "A6", activeCell: "A6" }];

  // ── Data rows (starting row 6) ────────────────────────────────────────────
  rows.forEach((r, idx) => {
    const rowNum = idx + 6;
    const row    = ws.getRow(rowNum);
    const isEven = idx % 2 === 0;

    const values = [
      r.name,
      r.username,
      r.email,
      r.phone,
      r.joinedAt ? new Date(r.joinedAt).toLocaleDateString("en-US") : "",
      r.accountType,
      r.sponsor,
      r.binaryParent,
      r.placement,
      r.accountStatus,
      r.operationalStatus,
      r.investmentPlan,
      r.investmentAmount ? parseFloat(r.investmentAmount) : "",
      r.depositWallet    ? parseFloat(r.depositWallet)    : 0,
      r.incomeWallet     ? parseFloat(r.incomeWallet)     : 0,
      r.withdrawalWallet ? parseFloat(r.withdrawalWallet) : 0,
      r.directReferrals,
      r.leftBV  ? parseFloat(r.leftBV)  : 0,
      r.rightBV ? parseFloat(r.rightBV) : 0,
    ];

    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.fill  = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: isEven ? "FFFAFAFA" : "FFFFFFFF" },
      };
      cell.alignment = { vertical: "middle" };

      // Color-code statuses
      if (i === 9) { // accountStatus
        cell.font = {
          bold: true,
          color: { argb: v === "ACTIVE" ? "FF16A34A" : v === "SUSPENDED" ? "FFB45309" : "FFDC2626" },
        };
      }
      if (i === 10) { // operationalStatus
        cell.font = {
          bold: true,
          color: { argb: v === "ACTIVE" ? "FF16A34A" : "FF6B7280" },
        };
      }
    });

    row.height = 17;
  });

  // ── Auto-size columns ─────────────────────────────────────────────────────
  const colWidths = [22, 16, 28, 14, 14, 12, 14, 14, 12, 14, 16, 14, 16, 14, 14, 16, 14, 10, 10];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Buffer;
}
