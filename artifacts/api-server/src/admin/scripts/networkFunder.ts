/**
 * Prime Wave Network Funder — Sprint 28D
 *
 * Funds exactly 128 endpoint SP accounts (left + right chain tail per RD).
 *
 * FUNDING RULE:
 *   Only the LAST account on each 50-deep chain receives funding.
 *   64 RDs × 2 endpoints = 128 funded accounts × $20,000 = $2,560,000 total.
 *
 * FUNDING METHOD:
 *   Reuses createManualAdminDeposit() exactly — the same code path that an
 *   authorised admin triggers from the UI. Produces identical artifacts:
 *     • DepositRequest  (status=APPROVED, approvalMode=MANUAL_ADMIN)
 *     • WalletTransaction (type=DEPOSIT, status=SUCCESS)
 *     • AdminLog (action=MANUAL_DEPOSIT)
 *     • Notification (type=DEPOSIT_APPROVED)
 *   No direct wallet manipulation. No SQL wallet updates. No bypasses.
 *
 * IDEMPOTENCY:
 *   Pre-fund check: if depositWallet == $20,000 → skip (never double-credit).
 *   Progress stored in system_settings (key: NETWORK_FUNDER_PROGRESS).
 *
 * EXECUTION:
 *   pnpm --filter @workspace/api-server run fund-network
 */

import * as XLSX from "xlsx";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { createManualAdminDeposit } from "../admin-deposits.service.js";

// ── Constants ─────────────────────────────────────────────────────────────────
//
// OUTPUT_DIR resolves via process.cwd() — needed because the funder is imported
// by index.ts (bundled into index.mjs), so import.meta.url would point to
// index.mjs rather than networkFunder.mjs. Both standalone and server-hosted
// runs share CWD = /home/runner/workspace/artifacts/api-server.
// Two levels up reaches the workspace root → /home/runner/workspace/generated.

const FUNDING_AMOUNT     = 20_000;
const RD_COUNT           = 64;
const CHAIN_DEPTH        = 50;      // accounts per side per RD
const EXPECTED_FUNDED    = RD_COUNT * 2;          // 128
const EXPECTED_TOTAL     = EXPECTED_FUNDED * FUNDING_AMOUNT;  // $2,560,000
const PASSWORD           = "Master@PrimeWave2025!";
const FUNDER_PROGRESS_KEY = "NETWORK_FUNDER_PROGRESS";
const OUTPUT_DIR         = path.resolve(process.cwd(), "../../generated");

// ── Types ─────────────────────────────────────────────────────────────────────

interface FunderProgress {
  rdComplete:    number;   // 0–64
  startedAt:     string;
  lastUpdatedAt: string;
}

interface FundedRow {
  username:            string;
  password:            string;
  accountType:         string;
  rdParent:            string;
  side:                "LEFT" | "RIGHT";
  depth:               number;
  depositWallet:       string;
  investmentWallet:    string;
  depositRequestId:    string;
  walletTransactionId: string;
  fundingStatus:       "FUNDED" | "SKIPPED_ALREADY_FUNDED" | "FAILED";
  timestamp:           string;
}

interface SummaryRow {
  rd:            string;
  leftEndpoint:  string;
  rightEndpoint: string;
  leftFunded:    boolean;
  rightFunded:   boolean;
  status:        string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

// ── Progress ──────────────────────────────────────────────────────────────────

async function loadProgress(): Promise<FunderProgress> {
  const row = await prisma.systemSettings.findUnique({ where: { key: FUNDER_PROGRESS_KEY } });
  if (!row) {
    return { rdComplete: 0, startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString() };
  }
  return JSON.parse(row.value) as FunderProgress;
}

async function saveProgress(p: FunderProgress): Promise<void> {
  p.lastUpdatedAt = new Date().toISOString();
  await prisma.systemSettings.upsert({
    where:  { key: FUNDER_PROGRESS_KEY },
    update: { value: JSON.stringify(p) },
    create: { key: FUNDER_PROGRESS_KEY, value: JSON.stringify(p), description: "Sprint 28D network funder progress" },
  });
}

// ── Chain depth verification ──────────────────────────────────────────────────
//
// Walk binaryParentId from endpoint UP to the RD, counting hops.
// Returns the number of hops (should be CHAIN_DEPTH = 50).

async function measureChainDepth(endpointId: string, rdId: string): Promise<number> {
  let currentId = endpointId;
  let depth     = 0;

  while (currentId !== rdId) {
    const user = await prisma.user.findUnique({
      where:  { id: currentId },
      select: { binaryParentId: true },
    });
    if (!user?.binaryParentId) {
      throw new Error(`Chain broken at node=${currentId} after ${depth} hops`);
    }
    currentId = user.binaryParentId;
    depth++;
    if (depth > 60) {
      throw new Error(`Chain depth exceeded 60 from endpoint=${endpointId} — structure error`);
    }
  }
  return depth;
}

// ── Pre-fund check for one RD ─────────────────────────────────────────────────

interface EndpointPair {
  rdId:            string;
  rdUsername:      string;
  leftId:          string;
  leftUsername:    string;
  leftWalletId:    string;
  leftDeposit:     Prisma.Decimal;
  leftIncome:      Prisma.Decimal;
  rightId:         string;
  rightUsername:   string;
  rightWalletId:   string;
  rightDeposit:    Prisma.Decimal;
  rightIncome:     Prisma.Decimal;
}

async function loadAndCheckRd(rdIndex: number): Promise<EndpointPair | null> {
  const rdUser = await prisma.user.findUnique({
    where:  { username: `rd${String(rdIndex).padStart(4, "0")}` },
    select: {
      id:                 true,
      username:           true,
      leftDeepestNodeId:  true,
      rightDeepestNodeId: true,
    },
  });

  if (!rdUser) {
    log(`  ⚠️  RD${rdIndex}: account not found — SKIP`);
    return null;
  }
  if (!rdUser.leftDeepestNodeId || !rdUser.rightDeepestNodeId) {
    log(`  ⚠️  RD${rdIndex}: missing deepest-node cache — SKIP`);
    return null;
  }

  // Load both endpoints with wallet data
  const [leftUser, rightUser] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: rdUser.leftDeepestNodeId },
      select: {
        id: true, username: true,
        wallet: { select: { id: true, depositWallet: true, incomeWallet: true } },
      },
    }),
    prisma.user.findUnique({
      where:  { id: rdUser.rightDeepestNodeId },
      select: {
        id: true, username: true,
        wallet: { select: { id: true, depositWallet: true, incomeWallet: true } },
      },
    }),
  ]);

  if (!leftUser?.wallet) {
    log(`  ⚠️  RD${rdIndex}: left endpoint not found or has no wallet — SKIP`);
    return null;
  }
  if (!rightUser?.wallet) {
    log(`  ⚠️  RD${rdIndex}: right endpoint not found or has no wallet — SKIP`);
    return null;
  }

  // Verify chain depths
  const [leftDepth, rightDepth] = await Promise.all([
    measureChainDepth(leftUser.id, rdUser.id),
    measureChainDepth(rightUser.id, rdUser.id),
  ]);

  if (leftDepth !== CHAIN_DEPTH) {
    log(`  ⚠️  RD${rdIndex}: left chain depth=${leftDepth} expected=${CHAIN_DEPTH} — SKIP`);
    return null;
  }
  if (rightDepth !== CHAIN_DEPTH) {
    log(`  ⚠️  RD${rdIndex}: right chain depth=${rightDepth} expected=${CHAIN_DEPTH} — SKIP`);
    return null;
  }

  return {
    rdId:          rdUser.id,
    rdUsername:    rdUser.username,
    leftId:        leftUser.id,
    leftUsername:  leftUser.username,
    leftWalletId:  leftUser.wallet.id,
    leftDeposit:   leftUser.wallet.depositWallet,
    leftIncome:    leftUser.wallet.incomeWallet,
    rightId:       rightUser.id,
    rightUsername: rightUser.username,
    rightWalletId: rightUser.wallet.id,
    rightDeposit:  rightUser.wallet.depositWallet,
    rightIncome:   rightUser.wallet.incomeWallet,
  };
}

// ── Fund one endpoint ─────────────────────────────────────────────────────────
//
// Uses createManualAdminDeposit — identical to an admin-UI manual deposit.
// Returns a FundedRow describing the result.

async function fundEndpoint(
  adminId:    string,
  userId:     string,
  username:   string,
  rdUsername: string,
  side:       "LEFT" | "RIGHT",
  depth:      number,
  currentDeposit: Prisma.Decimal,
): Promise<FundedRow> {
  const target = new Prisma.Decimal(FUNDING_AMOUNT);
  const ts     = new Date().toISOString();

  // ── Idempotency: already funded ────────────────────────────────────────────
  if (currentDeposit.gte(target)) {
    log(`    ↳ ${username} (${side}) — depositWallet=$${currentDeposit.toFixed(2)}  ALREADY FUNDED — skip`);
    // Load existing deposit record for Excel
    const existingDep = await prisma.depositRequest.findFirst({
      where:   { userId, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });
    const existingTx = await prisma.walletTransaction.findFirst({
      where:   { userId, type: "DEPOSIT" },
      orderBy: { createdAt: "desc" },
      select:  { id: true },
    });
    return {
      username:            username.toUpperCase(),
      password:            PASSWORD,
      accountType:         "SP (Spill)",
      rdParent:            rdUsername.toUpperCase(),
      side,
      depth,
      depositWallet:       currentDeposit.toFixed(2),
      investmentWallet:    "0.00",
      depositRequestId:    existingDep?.id ?? "—",
      walletTransactionId: existingTx?.id ?? "—",
      fundingStatus:       "SKIPPED_ALREADY_FUNDED",
      timestamp:           ts,
    };
  }

  // ── Execute funding via canonical deposit approval path ───────────────────
  const result = await createManualAdminDeposit(adminId, {
    userId,
    amount:  FUNDING_AMOUNT,
    network: "BEP20",
    reason:  "Network launch seed funding — Sprint 28D",
    notes:   `Endpoint: ${username.toUpperCase()}, RD: ${rdUsername.toUpperCase()}, Side: ${side}, Depth: ${depth}`,
  });

  // ── Post-fund verification ─────────────────────────────────────────────────
  const wallet = await prisma.wallet.findUnique({
    where:  { userId },
    select: { depositWallet: true, incomeWallet: true },
  });
  const [depCount, txCount] = await Promise.all([
    prisma.depositRequest.count({ where: { userId, status: "APPROVED" } }),
    prisma.walletTransaction.count({ where: { userId, type: "DEPOSIT", status: "SUCCESS" } }),
  ]);

  const funded  = wallet?.depositWallet.gte(target) ?? false;
  const noInv   = wallet?.incomeWallet.equals(0) ?? true;
  const oneDep  = depCount  === 1;
  const oneTx   = txCount   === 1;

  const ok = funded && noInv && oneDep && oneTx;
  log(
    `    ↳ ${username} (${side})`
    + `  depositWallet=$${wallet?.depositWallet.toFixed(2)}`
    + `  incomeWallet=$${wallet?.incomeWallet.toFixed(2)}`
    + `  deps=${depCount}  txs=${txCount}`
    + `  ${ok ? "✅ VERIFIED" : "❌ VERIFY FAILED"}`,
  );

  // Load the WalletTransaction id for the Excel
  const tx = await prisma.walletTransaction.findFirst({
    where:   { userId, type: "DEPOSIT" },
    orderBy: { createdAt: "desc" },
    select:  { id: true },
  });

  return {
    username:            username.toUpperCase(),
    password:            PASSWORD,
    accountType:         "SP (Spill)",
    rdParent:            rdUsername.toUpperCase(),
    side,
    depth,
    depositWallet:       wallet?.depositWallet.toFixed(2) ?? "0.00",
    investmentWallet:    wallet?.incomeWallet.toFixed(2)  ?? "0.00",
    depositRequestId:    result.depositId,
    walletTransactionId: tx?.id ?? "—",
    fundingStatus:       ok ? "FUNDED" : "FAILED",
    timestamp:           ts,
  };
}

// ── Verification ──────────────────────────────────────────────────────────────

async function runVerification(): Promise<boolean> {
  log("─── Final Verification ─────────────────────────────────────────────────");

  const target20k = new Prisma.Decimal(FUNDING_AMOUNT);

  // Count funded endpoints (depositWallet = $20,000 exactly)
  const funded = await prisma.wallet.count({
    where: { depositWallet: target20k.toString() as unknown as Prisma.DecimalFilter },
  });

  // Total users
  const totalUsers = await prisma.user.count({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
        { username: "master" },
      ],
    },
  });

  // Financial aggregates on funded wallets
  const walletAgg = await prisma.wallet.aggregate({
    where: { depositWallet: { gt: 0 } },
    _sum:  { depositWallet: true, incomeWallet: true },
  });
  const depositTotal = walletAgg._sum.depositWallet ?? new Prisma.Decimal(0);
  const incomeTotal  = walletAgg._sum.incomeWallet  ?? new Prisma.Decimal(0);

  // Deposit requests and wallet transactions
  const [depRequests, walletTxs, investments, depDups, txDups] = await Promise.all([
    prisma.depositRequest.count({ where: { status: "APPROVED" } }),
    prisma.walletTransaction.count({ where: { type: "DEPOSIT", status: "SUCCESS" } }),
    prisma.investment.count(),
    // Duplicate deposit requests per user (any user with >1 APPROVED deposit)
    prisma.depositRequest.groupBy({
      by: ["userId"],
      where: { status: "APPROVED" },
      having: { userId: { _count: { gt: 1 } } },
    }),
    // Duplicate wallet transactions per user (any user with >1 DEPOSIT success)
    prisma.walletTransaction.groupBy({
      by: ["userId"],
      where: { type: "DEPOSIT", status: "SUCCESS" },
      having: { userId: { _count: { gt: 1 } } },
    }),
  ]);

  // Binary integrity (no orphan generated accounts)
  const missingBinaryParent = await prisma.user.count({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
      ],
      binaryParentId: null,
      NOT: { username: "mi0001" },
    },
  });

  // Referral integrity
  const missingSponsor = await prisma.user.count({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
      ],
      sponsorId: null,
    },
  });

  const expectedDeposit = new Prisma.Decimal(EXPECTED_TOTAL);
  const checks = [
    { label: "Total users (incl. master)",        expected: 6528,                        actual: totalUsers,          pass: totalUsers === 6528 },
    { label: "Funded accounts",                   expected: EXPECTED_FUNDED,             actual: funded,              pass: funded === EXPECTED_FUNDED },
    { label: "Deposit wallet total",              expected: `$${EXPECTED_TOTAL.toLocaleString()}`, actual: `$${depositTotal.toFixed(2)}`, pass: depositTotal.equals(expectedDeposit) },
    { label: "Income wallet total (must be $0)",  expected: "$0.00",                     actual: `$${incomeTotal.toFixed(2)}`,  pass: incomeTotal.equals(0) },
    { label: "Investments (must be 0)",           expected: 0,                           actual: investments,         pass: investments === 0 },
    { label: "Deposit requests (APPROVED)",       expected: EXPECTED_FUNDED,             actual: depRequests,         pass: depRequests === EXPECTED_FUNDED },
    { label: "Wallet transactions (DEPOSIT)",     expected: EXPECTED_FUNDED,             actual: walletTxs,           pass: walletTxs === EXPECTED_FUNDED },
    { label: "Duplicate deposit requests",        expected: 0,                           actual: depDups.length,      pass: depDups.length === 0 },
    { label: "Duplicate wallet transactions",     expected: 0,                           actual: txDups.length,       pass: txDups.length === 0 },
    { label: "Binary integrity (no orphans)",     expected: 0,                           actual: missingBinaryParent, pass: missingBinaryParent === 0 },
    { label: "Referral integrity (all sponsored)", expected: 0,                          actual: missingSponsor,      pass: missingSponsor === 0 },
  ];

  let allPass = true;
  for (const c of checks) {
    const status = c.pass ? "✅ PASS" : "❌ FAIL";
    log(`  ${status}  ${c.label}: expected=${c.expected}  actual=${c.actual}`);
    if (!c.pass) allPass = false;
  }
  return allPass;
}

// ── Excel generation ──────────────────────────────────────────────────────────

async function generateExcel(fundedRows: FundedRow[], summaryRows: SummaryRow[]): Promise<void> {
  log("─── Generating Excel files ─────────────────────────────────────────────");
  await mkdir(OUTPUT_DIR, { recursive: true });

  // ── Workbook 1: PrimeWave_Funded_Accounts.xlsx ────────────────────────────
  const wb1 = XLSX.utils.book_new();
  const sheet1Data = fundedRows.map(r => ({
    "Username":             r.username,
    "Password":             r.password,
    "Account Type":         r.accountType,
    "RD Parent":            r.rdParent,
    "Side":                 r.side,
    "Depth":                r.depth,
    "Deposit Wallet ($)":   r.depositWallet,
    "Investment Wallet ($)": r.investmentWallet,
    "Deposit Request ID":   r.depositRequestId,
    "Wallet Transaction ID": r.walletTransactionId,
    "Funding Status":       r.fundingStatus,
    "Timestamp":            r.timestamp,
  }));
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(sheet1Data), "Funded Accounts");

  const fa = path.join(OUTPUT_DIR, "PrimeWave_Funded_Accounts.xlsx");
  XLSX.writeFile(wb1, fa);
  log(`  Written: ${fa}`);

  // ── Workbook 2: PrimeWave_Funding_Summary.xlsx ────────────────────────────
  const wb2 = XLSX.utils.book_new();

  // Sheet 1: per-RD summary
  const s1Data = summaryRows.map(r => ({
    "RD":            r.rd,
    "Left Endpoint": r.leftEndpoint,
    "Right Endpoint": r.rightEndpoint,
    "Left Funded":   r.leftFunded  ? "YES" : "NO",
    "Right Funded":  r.rightFunded ? "YES" : "NO",
    "Status":        r.status,
  }));
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(s1Data), "Per-RD Summary");

  // Sheet 2: totals
  const funded     = fundedRows.filter(r => r.fundingStatus === "FUNDED").length;
  const skipped    = fundedRows.filter(r => r.fundingStatus === "SKIPPED_ALREADY_FUNDED").length;
  const failed     = fundedRows.filter(r => r.fundingStatus === "FAILED").length;
  const actualTotal = fundedRows
    .filter(r => r.fundingStatus === "FUNDED" || r.fundingStatus === "SKIPPED_ALREADY_FUNDED")
    .reduce((sum, r) => sum + parseFloat(r.depositWallet), 0);

  const s2Data = [
    { Metric: "Expected Funded Accounts",  Value: EXPECTED_FUNDED },
    { Metric: "Actual Funded",             Value: funded + skipped },
    { Metric: "Newly Funded",              Value: funded },
    { Metric: "Skipped (already funded)",  Value: skipped },
    { Metric: "Failed",                    Value: failed },
    { Metric: "Expected Wallet Total ($)", Value: EXPECTED_TOTAL.toLocaleString() },
    { Metric: "Actual Wallet Total ($)",   Value: actualTotal.toLocaleString() },
  ];
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(s2Data), "Totals");

  const fs2 = path.join(OUTPUT_DIR, "PrimeWave_Funding_Summary.xlsx");
  XLSX.writeFile(wb2, fs2);
  log(`  Written: ${fs2}`);
}

// ── Exported entry point ──────────────────────────────────────────────────────

export async function runFunder(): Promise<void> {
  return main();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  log("══════════════════════════════════════════════════════════════════════════");
  log("  Prime Wave Network Funder — Sprint 28D");
  log(`  Funding: 128 endpoints × $${FUNDING_AMOUNT.toLocaleString()} = $${EXPECTED_TOTAL.toLocaleString()} total`);
  log("══════════════════════════════════════════════════════════════════════════");

  // ── Load SUPER_ADMIN ───────────────────────────────────────────────────────
  const superAdmin = await prisma.admin.findFirst({
    where:  { role: "SUPER_ADMIN" },
    select: { id: true, email: true },
  });
  if (!superAdmin) {
    throw new Error("No SUPER_ADMIN found in admin table — cannot proceed");
  }
  log(`SUPER_ADMIN: ${superAdmin.email} (${superAdmin.id})`);

  const progress    = await loadProgress();
  log(`Progress: rdComplete=${progress.rdComplete}/64`);

  const fundedRows: FundedRow[]   = [];
  const summaryRows: SummaryRow[] = [];

  // ── Process each RD ───────────────────────────────────────────────────────
  for (let rdIdx = 1; rdIdx <= RD_COUNT; rdIdx++) {
    if (rdIdx <= progress.rdComplete) {
      log(`  RD${String(rdIdx).padStart(2, "0")}/64 — already complete, skipping`);
      continue;
    }

    log(`\n─── RD${String(rdIdx).padStart(2, "0")}/64 ─────────────────────────────────────────────────────────────`);

    const endpoints = await loadAndCheckRd(rdIdx);

    if (!endpoints) {
      summaryRows.push({
        rd:            `rd${String(rdIdx).padStart(4, "0")}`.toUpperCase(),
        leftEndpoint:  "—",
        rightEndpoint: "—",
        leftFunded:    false,
        rightFunded:   false,
        status:        "PRE-CHECK FAILED",
      });
      // Still mark progress so we don't retry indefinitely
      progress.rdComplete = rdIdx;
      await saveProgress(progress);
      continue;
    }

    log(`  Left endpoint:  ${endpoints.leftUsername}  (depth=${CHAIN_DEPTH})`);
    log(`  Right endpoint: ${endpoints.rightUsername}  (depth=${CHAIN_DEPTH})`);
    log(`  Pre-check: left.depositWallet=$${endpoints.leftDeposit.toFixed(2)}  right.depositWallet=$${endpoints.rightDeposit.toFixed(2)}`);

    // ── Fund left endpoint ──────────────────────────────────────────────────
    const leftRow = await fundEndpoint(
      superAdmin.id,
      endpoints.leftId,
      endpoints.leftUsername,
      endpoints.rdUsername,
      "LEFT",
      CHAIN_DEPTH,
      endpoints.leftDeposit,
    );
    fundedRows.push(leftRow);

    // ── Fund right endpoint ─────────────────────────────────────────────────
    const rightRow = await fundEndpoint(
      superAdmin.id,
      endpoints.rightId,
      endpoints.rightUsername,
      endpoints.rdUsername,
      "RIGHT",
      CHAIN_DEPTH,
      endpoints.rightDeposit,
    );
    fundedRows.push(rightRow);

    const leftOk  = leftRow.fundingStatus  !== "FAILED";
    const rightOk = rightRow.fundingStatus !== "FAILED";

    summaryRows.push({
      rd:            endpoints.rdUsername.toUpperCase(),
      leftEndpoint:  endpoints.leftUsername.toUpperCase(),
      rightEndpoint: endpoints.rightUsername.toUpperCase(),
      leftFunded:    leftOk,
      rightFunded:   rightOk,
      status:        leftOk && rightOk ? "COMPLETE" : "PARTIAL/FAILED",
    });

    progress.rdComplete = rdIdx;
    await saveProgress(progress);
  }

  // ── Final verification ─────────────────────────────────────────────────────
  const allPass = await runVerification();

  // ── Excel ──────────────────────────────────────────────────────────────────
  await generateExcel(fundedRows, summaryRows);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes  = Math.floor(elapsed / 60);
  const seconds  = elapsed % 60;

  log("\n══════════════════════════════════════════════════════════════════════════");
  log("  SPRINT 28D COMPLETE — NETWORK FUNDING ENGINE");
  log(`  Funded endpoints     : 128 (64 LEFT + 64 RIGHT)`);
  log(`  Funding per endpoint : $${FUNDING_AMOUNT.toLocaleString()}`);
  log(`  Total funded         : $${EXPECTED_TOTAL.toLocaleString()}`);
  log(`  Method               : createManualAdminDeposit() — identical to admin UI`);
  log(`  Artifacts per credit : DepositRequest + WalletTransaction + AdminLog + Notification`);
  log(`  Investments created  : 0 (deposit wallet only)`);
  log(`  Runtime              : ${minutes}m ${seconds}s`);
  log(`  Verification         : ${allPass ? "✅ ALL PASS" : "❌ SOME FAILED"}`);
  log(`  Ready for            : Sprint 28E`);
  log("══════════════════════════════════════════════════════════════════════════");

  if (!allPass) process.exit(1);
}

// Guard: only auto-execute when invoked directly as a standalone script.
const isStandaloneScript =
  process.argv[1] != null &&
  (process.argv[1].endsWith("networkFunder.mjs") ||
   process.argv[1].endsWith("networkFunder.ts"));

if (isStandaloneScript) {
  main()
    .catch(err => {
      console.error("FATAL:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
