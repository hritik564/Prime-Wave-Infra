import { type Request, type Response, type NextFunction } from "express";
import { type AuthenticatedRequest } from "../shared/types";
import { sendSuccess } from "../shared/response";
import { getParsed } from "../middleware/validate.middleware";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import {
  getLedgerSummary,
  getLedgerEntries,
  getAllLedgerEntriesForExport,
} from "../ledger/ledger.service";
import {
  runAndSaveReconciliation,
  getReconciliationReports,
} from "../ledger/reconciliation.service";
import { runIntegrityScan } from "../ledger/integrity-scan.service";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Treasury Dashboard ────────────────────────────────────────────────────────

export async function getTreasuryDashboardHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const [summary, latestReport, openDiscrepancies, totalWalletBalance] = await Promise.all([
      getLedgerSummary(),
      prisma.reconciliationReport.findFirst({
        orderBy: { runAt: "desc" },
        select: { id: true, runAt: true, status: true, discrepancyCount: true, isManual: true },
      }),
      prisma.financialDiscrepancy.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      prisma.wallet.aggregate({
        _sum: {
          depositWallet:           true,
          incomeWallet:            true,
          withdrawalWallet:        true,
          lockedWithdrawalBalance: true,
        },
      }),
    ]);

    const totalLocked     = totalWalletBalance._sum.lockedWithdrawalBalance ?? 0;
    const totalDeposit    = totalWalletBalance._sum.depositWallet ?? 0;
    const totalIncome     = totalWalletBalance._sum.incomeWallet ?? 0;
    const totalWithdrawal = totalWalletBalance._sum.withdrawalWallet ?? 0;

    let ledgerHealth: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
    if (openDiscrepancies > 0 && openDiscrepancies < 3) ledgerHealth = "WARNING";
    if (openDiscrepancies >= 3) ledgerHealth = "CRITICAL";
    if (latestReport?.status === "DISCREPANCIES_FOUND") ledgerHealth = ledgerHealth === "CRITICAL" ? "CRITICAL" : "WARNING";

    sendSuccess(res, {
      ledger:            summary,
      reconciliation: {
        latestReport,
        openDiscrepancies,
        status: latestReport?.status ?? "NEVER_RUN",
      },
      walletTotals: {
        depositWallet:    String(totalDeposit),
        incomeWallet:     String(totalIncome),
        withdrawalWallet: String(totalWithdrawal),
        lockedBalance:    String(totalLocked),
        platformTotal:    String(
          Number(totalDeposit) + Number(totalIncome) + Number(totalWithdrawal) + Number(totalLocked)
        ),
      },
      health: {
        ledgerHealth,
        openDiscrepancies,
        lastScanAt: latestReport?.runAt ?? null,
      },
    }, "Treasury dashboard loaded");
  } catch (err) { next(err); }
}

// ── Ledger Entries ────────────────────────────────────────────────────────────

export async function getLedgerEntriesHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = req.query as Record<string, string>;
    const result = await getLedgerEntries({
      page:            q["page"]  ? parseInt(q["page"],  10) : 1,
      limit:           q["limit"] ? parseInt(q["limit"], 10) : 50,
      memberId:        q["memberId"]        || undefined,
      transactionType: q["transactionType"] || undefined,
      debitCredit:     q["debitCredit"]     || undefined,
      walletType:      q["walletType"]      || undefined,
      from:            q["from"] ? new Date(q["from"]) : undefined,
      to:              q["to"]   ? new Date(q["to"])   : undefined,
      search:          q["search"] || undefined,
    });
    sendSuccess(res, result, "Ledger entries retrieved");
  } catch (err) { next(err); }
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export async function getReconciliationReportsHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const reports = await getReconciliationReports(30);
    sendSuccess(res, { reports }, "Reconciliation reports retrieved");
  } catch (err) { next(err); }
}

export async function triggerReconciliationHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    logger.info({ adminId: user.sub }, "treasury: manual reconciliation triggered");
    const result = await runAndSaveReconciliation({ isManual: true, triggeredBy: user.sub });
    sendSuccess(res, {
      status:           result.status,
      discrepancyCount: result.discrepancies.length,
      durationMs:       result.durationMs,
      discrepancies:    result.discrepancies,
      blockchain:       result.blockchain,
      ledger:           result.ledger,
      summary:          result.summary,
    }, "Reconciliation completed");
  } catch (err) { next(err); }
}

export async function triggerIntegrityScanHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user } = req as AuthenticatedRequest;
    const result = await runIntegrityScan(user.sub);
    sendSuccess(res, result, "Integrity scan completed");
  } catch (err) { next(err); }
}

// ── Discrepancy Management ────────────────────────────────────────────────────

export async function getDiscrepanciesHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = req.query as Record<string, string>;
    const status   = q["status"]   as string | undefined;
    const severity = q["severity"] as string | undefined;
    const page     = parseInt(q["page"]  ?? "1",  10);
    const limit    = Math.min(100, parseInt(q["limit"] ?? "50", 10));

    const where: Record<string, unknown> = {};
    if (status)   where["status"]   = status;
    if (severity) where["severity"] = severity;

    const [discrepancies, total] = await Promise.all([
      prisma.financialDiscrepancy.findMany({
        where,
        orderBy: [{ status: "asc" }, { severity: "desc" }, { detectedAt: "desc" }],
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      prisma.financialDiscrepancy.count({ where }),
    ]);

    sendSuccess(res, {
      discrepancies,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    }, "Discrepancies retrieved");
  } catch (err) { next(err); }
}

export async function updateDiscrepancyHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { user }          = req as AuthenticatedRequest;
    const id                = String(req.params["id"] ?? "");
    const { status, resolutionNotes } = req.body as {
      status:           "OPEN" | "UNDER_REVIEW" | "RESOLVED";
      resolutionNotes?: string;
    };

    if (!["OPEN", "UNDER_REVIEW", "RESOLVED"].includes(status)) {
      throw new AppError("Invalid status", HTTP_STATUS.BAD_REQUEST, "INVALID_STATUS");
    }

    const existing = await prisma.financialDiscrepancy.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Discrepancy not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
    }

    const updated = await prisma.financialDiscrepancy.update({
      where: { id },
      data: {
        status,
        resolutionNotes: resolutionNotes ?? existing.resolutionNotes,
        resolvedAt:  status === "RESOLVED" ? new Date() : existing.resolvedAt,
        resolvedBy:  status === "RESOLVED" ? user.sub   : existing.resolvedBy,
      },
    });

    logger.info({ id, status, adminId: user.sub }, "treasury: discrepancy updated");
    sendSuccess(res, updated, "Discrepancy updated");
  } catch (err) { next(err); }
}

// ── CSV / XLSX Export ─────────────────────────────────────────────────────────

export async function exportLedgerCsvHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const q = req.query as Record<string, string>;
    const entries = await getAllLedgerEntriesForExport({
      from:            q["from"] ? new Date(q["from"]) : undefined,
      to:              q["to"]   ? new Date(q["to"])   : undefined,
      transactionType: q["transactionType"] || undefined,
      memberId:        q["memberId"]        || undefined,
    });

    const headers = [
      "id", "createdAt", "memberId", "username", "transactionType",
      "debitCredit", "walletType", "amount", "currency",
      "openingBalance", "closingBalance",
      "referenceId", "referenceType",
      "withdrawalId", "investmentId", "blockchainTxHash",
    ];

    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const rows = [
      headers.join(","),
      ...entries.map((e) =>
        headers.map((h) => escape((e as unknown as Record<string, unknown>)[h])).join(",")
      ),
    ];

    const csv      = rows.join("\r\n");
    const filename = `ledger-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-cache");
    res.send(csv);
  } catch (err) { next(err); }
}

export async function exportReconciliationCsvHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { runAndSaveReconciliation: runRecon } = await import("../ledger/reconciliation.service");
    const result = await runRecon({ isManual: false });

    const lines: string[] = [
      "=== PRIMEWAVE RECONCILIATION REPORT ===",
      `Generated At,${new Date().toISOString()}`,
      `Status,${result.status}`,
      `Discrepancies Found,${result.discrepancies.length}`,
      `Duration (ms),${result.durationMs}`,
      "",
      "=== LEDGER SUMMARY ===",
      "Metric,Value",
      `Ledger Entry Count,${result.ledger.ledgerEntryCount}`,
      `Wallet Tx Count,${result.ledger.walletTransactionCount}`,
      `Ledger Deposit Credits,$${result.ledger.ledgerDepositTotal}`,
      `DB Approved Deposits,$${result.ledger.dbDepositTotal}`,
      `Deposit Delta,$${result.ledger.depositDelta}`,
      `Ledger Investment Debits,$${result.ledger.ledgerInvestmentTotal}`,
      `DB Total Investments,$${result.ledger.dbInvestmentTotal}`,
      `Investment Delta,$${result.ledger.investmentDelta}`,
      "",
      "=== BLOCKCHAIN SUMMARY ===",
      "Metric,Value",
      `Completed Withdrawals,${result.blockchain.totalCompletedWithdrawals}`,
      `Completed Amount,$${result.blockchain.totalCompletedAmount}`,
      `Confirming Withdrawals,${result.blockchain.totalConfirmingWithdrawals}`,
      `Duplicate TX Hashes,${result.blockchain.duplicateTxHashes}`,
      `Orphaned Confirming,${result.blockchain.orphanedConfirming}`,
      `Stuck Processing,${result.blockchain.stuckProcessing}`,
      "",
      "=== DISCREPANCIES ===",
      "Type,Severity,Description",
      ...result.discrepancies.map((d) => `${d.type},${d.severity},"${d.description.replace(/"/g, '""')}"`),
      "",
      "=== NEGATIVE BALANCE USERS ===",
      "UserId,Fields",
      ...result.wallets
        .filter((w) => w.hasNegative)
        .map((w) => `${w.userId},"${w.negativeFields.join(", ")}"`),
    ];

    const filename = `reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-cache");
    res.send(lines.join("\r\n"));
  } catch (err) { next(err); }
}
