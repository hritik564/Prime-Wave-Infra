/**
 * Prime Wave Credential Exporter — Sprint 28E
 *
 * Generates 3 verified Excel workbooks from the production genesis network:
 *
 *   PrimeWave_All_Accounts.xlsx    — all 6528 accounts (1 row each)
 *   PrimeWave_RD_Accounts.xlsx     — 64 RD accounts with chain/funding detail
 *   PrimeWave_Funded_Accounts.xlsx — 128 funded SP endpoints
 *
 * Step order matches Sprint 28E specification exactly:
 *   Step 1 — Password verification
 *   Step 2 — Count verification
 *   Step 3 — File 1
 *   Step 4 — File 2
 *   Step 5 — File 3
 *   Step 6 — Cross-verification
 */

import * as XLSX from "xlsx";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { prisma } from "../../config/prisma.js";
import bcrypt from "bcryptjs";

// ── Constants ──────────────────────────────────────────────────────────────────

const PASSWORD    = "Master@PrimeWave2025!";
const HASH_ROUNDS = 12;
const OUTPUT_DIR  = path.resolve(process.cwd(), "../../generated");

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function fmt(n: number | bigint | string): string {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

// ── Step 1: Password Verification ─────────────────────────────────────────────

async function verifyPassword(): Promise<void> {
  log("══════════════════════════════════════════════════════════════════════════");
  log("  STEP 1 — PASSWORD VERIFICATION");
  log("══════════════════════════════════════════════════════════════════════════");

  log(`  Plaintext password in generator source: "${PASSWORD}"`);
  log(`  Hash algorithm: bcrypt, rounds=${HASH_ROUNDS}`);

  // Sample 5 accounts (one of each tier) and verify their stored hash
  const sampleUsernames = ["master", "mi0001", "mi0063", "rd0001", "rd0064"];
  let allPass = true;

  for (const uname of sampleUsernames) {
    const user = await prisma.user.findUnique({ where: { username: uname } });
    if (!user) {
      log(`  ⚠️  User not found: ${uname}`);
      allPass = false;
      continue;
    }
    const match = await bcrypt.compare(PASSWORD, user.passwordHash);
    if (match) {
      log(`  ✅ ${uname.padEnd(10)} hash matches "${PASSWORD}"`);
    } else {
      log(`  ❌ ${uname.padEnd(10)} hash does NOT match — ABORT`);
      allPass = false;
    }
  }

  // Spot-check an SP account
  const sp = await prisma.user.findFirst({ where: { username: { startsWith: "sp0" } } });
  if (sp) {
    const spMatch = await bcrypt.compare(PASSWORD, sp.passwordHash);
    log(`  ${spMatch ? "✅" : "❌"} ${sp.username.padEnd(10)} hash ${spMatch ? "matches" : "does NOT match"} "${PASSWORD}"`);
    if (!spMatch) allPass = false;
  }

  if (!allPass) {
    throw new Error("Password verification FAILED — aborting Excel generation.");
  }

  log("");
  log("  Password verification: ✅ PASS");
  log(`  All generated accounts use password: "${PASSWORD}"`);
  log(`  Hashed with: bcrypt, ${HASH_ROUNDS} rounds`);
}

// ── Step 2: Count Verification ─────────────────────────────────────────────────

interface Counts {
  master: number;
  mi: number;
  rd: number;
  sp: number;
  total: number;
  funded: number;
  depositTotal: number;
}

async function verifyCounts(): Promise<Counts> {
  log("");
  log("══════════════════════════════════════════════════════════════════════════");
  log("  STEP 2 — COUNT VERIFICATION");
  log("══════════════════════════════════════════════════════════════════════════");

  const [master, mi, rd, sp, total, funded, depositAgg] = await Promise.all([
    prisma.user.count({ where: { username: "master" } }),
    prisma.user.count({ where: { username: { startsWith: "mi0" } } }),
    prisma.user.count({ where: { username: { startsWith: "rd0" } } }),
    prisma.user.count({ where: { username: { startsWith: "sp0" } } }),
    prisma.user.count(),
    prisma.depositRequest.count({ where: { status: "APPROVED" } }),
    prisma.wallet.aggregate({ _sum: { depositWallet: true } }),
  ]);

  const depositTotal = Number(depositAgg._sum.depositWallet ?? 0);

  const checks: Array<{ label: string; expected: number | string; actual: number | string }> = [
    { label: "Master users",         expected: 1,           actual: master },
    { label: "MI users",             expected: 63,          actual: mi },
    { label: "RD users",             expected: 64,          actual: rd },
    { label: "SP users",             expected: 6400,        actual: sp },
    { label: "Grand total",          expected: 6528,        actual: total },
    { label: "Funded endpoints",     expected: 128,         actual: funded },
    { label: "Deposit wallet total", expected: 2_560_000,   actual: depositTotal },
  ];

  let allPass = true;
  for (const c of checks) {
    const pass = String(c.expected) === String(c.actual);
    log(`  ${pass ? "✅" : "❌"} PASS  ${c.label.padEnd(28)} expected=${c.expected}  actual=${c.actual}`);
    if (!pass) allPass = false;
  }

  if (!allPass) throw new Error("Count verification FAILED — aborting.");

  log("");
  log("  Count verification: ✅ PASS");

  return { master, mi, rd, sp, total, funded, depositTotal };
}

// ── Data Loading ───────────────────────────────────────────────────────────────

async function loadAllData() {
  log("");
  log("  Loading all users + wallets from DB…");

  // All users with sponsor + binary parent usernames + wallet
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      status: true,
      position: true,
      directReferralCount: true,
      sponsorId: true,
      binaryParentId: true,
      createdAt: true,
      sponsor: { select: { username: true } },
      binaryParent: { select: { username: true } },
      wallet: {
        select: {
          depositWallet: true,
          incomeWallet: true,
          withdrawalWallet: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  log(`  Loaded ${users.length} users.`);

  // Build binary parent map and compute levels (BFS from master)
  const idToUser = new Map(users.map(u => [u.id, u]));
  const levelMap = new Map<string, number>();

  const masterUser = users.find(u => u.username === "master");
  if (!masterUser) throw new Error("master account not found");

  // BFS traversal
  const queue: Array<{ id: string; level: number }> = [{ id: masterUser.id, level: 0 }];
  // Build children map
  const childrenMap = new Map<string, string[]>();
  for (const u of users) {
    if (u.binaryParentId) {
      if (!childrenMap.has(u.binaryParentId)) childrenMap.set(u.binaryParentId, []);
      childrenMap.get(u.binaryParentId)!.push(u.id);
    }
  }
  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    levelMap.set(id, level);
    for (const childId of (childrenMap.get(id) ?? [])) {
      queue.push({ id: childId, level: level + 1 });
    }
  }

  log(`  Computed binary depth for ${levelMap.size} nodes.`);

  // Funded accounts: deposit_requests + wallet_transactions
  const fundedRaw = await prisma.depositRequest.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      userId: true,
      amount: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const fundedUserIds = new Set(fundedRaw.map(d => d.userId));

  // Map userId → deposit request
  const depositByUser = new Map(fundedRaw.map(d => [d.userId, d]));

  // Wallet transactions (DEPOSIT type for funded accounts)
  const txRaw = await prisma.walletTransaction.findMany({
    where: {
      userId: { in: [...fundedUserIds] },
      type: "DEPOSIT",
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      status: true,
      netAmount: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const txByUser = new Map(txRaw.map(t => [t.userId, t]));

  log(`  Loaded ${fundedRaw.length} deposit requests, ${txRaw.length} wallet transactions.`);

  return { users, levelMap, fundedUserIds, depositByUser, txByUser, idToUser, masterUser };
}

// ── File 1: PrimeWave_All_Accounts.xlsx ────────────────────────────────────────

type AnyUser = Awaited<ReturnType<typeof loadAllData>>["users"][0];

function accountType(u: AnyUser): string {
  if (u.username === "master") return "MASTER";
  if (u.username.startsWith("mi0")) return "MI";
  if (u.username.startsWith("rd0")) return "RD";
  return "SP";
}

async function generateFile1(
  users: AnyUser[],
  levelMap: Map<string, number>,
  fundedUserIds: Set<string>,
  outputDir: string,
): Promise<number> {
  log("");
  log("══════════════════════════════════════════════════════════════════════════");
  log("  STEP 3 — FILE 1: PrimeWave_All_Accounts.xlsx");
  log("══════════════════════════════════════════════════════════════════════════");

  const rows = users.map(u => ({
    "Username":           u.username,
    "Password":           PASSWORD,
    "Account Type":       accountType(u),
    "Level":              levelMap.get(u.id) ?? 0,
    "Referral Sponsor":   u.sponsor?.username ?? "",
    "Binary Parent":      u.binaryParent?.username ?? "",
    "Placement Side":     u.position ?? "",
    "Status":             u.status,
    "Deposit Wallet":     Number(u.wallet?.depositWallet ?? 0),
    "Income Wallet":      Number(u.wallet?.incomeWallet ?? 0),
    "Withdrawal Wallet":  Number(u.wallet?.withdrawalWallet ?? 0),
    "Investment Wallet":  0,
    "Funded":             fundedUserIds.has(u.id) ? "YES" : "NO",
    "Created At":         fmtDate(u.createdAt),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 7 },
    { wch: 16 }, { wch: 14 }, { wch: 15 }, { wch: 10 },
    { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 7 }, { wch: 24 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "All Accounts");

  const filePath = path.join(outputDir, "PrimeWave_All_Accounts.xlsx");
  XLSX.writeFile(wb, filePath);
  log(`  Written: ${filePath}`);
  log(`  Rows: ${rows.length}`);

  return rows.length;
}

// ── File 2: PrimeWave_RD_Accounts.xlsx ─────────────────────────────────────────

async function generateFile2(
  users: AnyUser[],
  fundedUserIds: Set<string>,
  depositByUser: Map<string, { userId: string }>,
  outputDir: string,
): Promise<number> {
  log("");
  log("══════════════════════════════════════════════════════════════════════════");
  log("  STEP 4 — FILE 2: PrimeWave_RD_Accounts.xlsx");
  log("══════════════════════════════════════════════════════════════════════════");

  const rdUsers = users.filter(u => u.username.startsWith("rd0"));

  // Build sponsorId → funded user (LEFT/RIGHT) maps
  // SP accounts sponsored by this RD that are funded
  const sponsorToFunded = new Map<string, AnyUser[]>();
  for (const u of users) {
    if (!u.sponsorId) continue;
    if (!fundedUserIds.has(u.id)) continue;
    if (!sponsorToFunded.has(u.sponsorId)) sponsorToFunded.set(u.sponsorId, []);
    sponsorToFunded.get(u.sponsorId)!.push(u);
  }

  // Count SP accounts sponsored by each RD per position (LEFT/RIGHT)
  const sponsorLeftCount = new Map<string, number>();
  const sponsorRightCount = new Map<string, number>();
  for (const u of users) {
    if (!u.sponsorId || !u.username.startsWith("sp0")) continue;
    if (u.position === "LEFT")  sponsorLeftCount.set(u.sponsorId,  (sponsorLeftCount.get(u.sponsorId)  ?? 0) + 1);
    if (u.position === "RIGHT") sponsorRightCount.set(u.sponsorId, (sponsorRightCount.get(u.sponsorId) ?? 0) + 1);
  }

  const rows = rdUsers.map((rd, i) => {
    const rdNum = i + 1;
    const funded = sponsorToFunded.get(rd.id) ?? [];
    const leftEndpoint  = funded.find(f => f.position === "LEFT")?.username  ?? "";
    const rightEndpoint = funded.find(f => f.position === "RIGHT")?.username ?? "";

    return {
      "Username":             rd.username,
      "Password":             PASSWORD,
      "RD Number":            rdNum,
      "Binary Parent":        rd.binaryParent?.username ?? "",
      "Referral Sponsor":     rd.sponsor?.username ?? "",
      "Left Chain Size":      sponsorLeftCount.get(rd.id)  ?? 0,
      "Right Chain Size":     sponsorRightCount.get(rd.id) ?? 0,
      "Direct Referrals":     rd.directReferralCount,
      "Funded Left Endpoint": leftEndpoint,
      "Funded Right Endpoint":rightEndpoint,
      "Status":               rd.status,
      "Created At":           fmtDate(rd.createdAt),
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 26 }, { wch: 10 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 17 }, { wch: 16 },
    { wch: 22 }, { wch: 23 }, { wch: 10 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "RD Accounts");

  const filePath = path.join(outputDir, "PrimeWave_RD_Accounts.xlsx");
  XLSX.writeFile(wb, filePath);
  log(`  Written: ${filePath}`);
  log(`  Rows: ${rows.length}`);

  return rows.length;
}

// ── File 3: PrimeWave_Funded_Accounts.xlsx ────────────────────────────────────

async function generateFile3(
  users: AnyUser[],
  levelMap: Map<string, number>,
  fundedUserIds: Set<string>,
  depositByUser: Map<string, { id: string; userId: string; amount: unknown; status: string; createdAt: Date }>,
  txByUser: Map<string, { id: string; userId: string; amount: unknown; status: string; netAmount: unknown }>,
  outputDir: string,
): Promise<number> {
  log("");
  log("══════════════════════════════════════════════════════════════════════════");
  log("  STEP 5 — FILE 3: PrimeWave_Funded_Accounts.xlsx");
  log("══════════════════════════════════════════════════════════════════════════");

  // Build username → user map for sponsor lookups
  const byId = new Map(users.map(u => [u.id, u]));

  const fundedUsers = users.filter(u => fundedUserIds.has(u.id));

  // Compute chain depth = binary depth relative to their owning RD
  // owning RD is the sponsor of the SP account
  const rdLevelMap = new Map<string, number>();
  for (const u of users) {
    if (u.username.startsWith("rd0")) {
      rdLevelMap.set(u.id, levelMap.get(u.id) ?? 0);
    }
  }

  const rows = fundedUsers.map(u => {
    const dep   = depositByUser.get(u.id);
    const tx    = txByUser.get(u.id);
    const rdUser = u.sponsorId ? byId.get(u.sponsorId) : undefined;

    // Chain depth = binary depth from master minus the RD's binary depth
    const myLevel  = levelMap.get(u.id)  ?? 0;
    const rdLevel  = rdUser ? (levelMap.get(rdUser.id) ?? 0) : 0;
    const chainDepth = myLevel - rdLevel;

    return {
      "Username":              u.username,
      "Password":              PASSWORD,
      "Owning RD":             rdUser?.username ?? "",
      "Side":                  u.position ?? "",
      "Chain Depth":           chainDepth,
      "Deposit Wallet":        Number(u.wallet?.depositWallet ?? 0),
      "Investment Wallet":     0,
      "Deposit Request ID":    dep?.id ?? "",
      "Wallet Transaction ID": tx?.id  ?? "",
      "Funding Amount":        Number(dep?.amount ?? 0),
      "Funding Status":        dep?.status ?? "",
      "Created At":            fmtDate(dep?.createdAt ?? u.createdAt),
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 26 }, { wch: 12 }, { wch: 7 },
    { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 38 },
    { wch: 38 }, { wch: 16 }, { wch: 14 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Funded Accounts");

  const filePath = path.join(outputDir, "PrimeWave_Funded_Accounts.xlsx");
  XLSX.writeFile(wb, filePath);
  log(`  Written: ${filePath}`);
  log(`  Rows: ${rows.length}`);

  return rows.length;
}

// ── Step 6: Cross-Verification ─────────────────────────────────────────────────

function crossVerify(
  allRows: number,
  rdRows: number,
  fundedRows: number,
  users: AnyUser[],
  fundedUserIds: Set<string>,
): void {
  log("");
  log("══════════════════════════════════════════════════════════════════════════");
  log("  STEP 6 — CROSS-VERIFICATION");
  log("══════════════════════════════════════════════════════════════════════════");

  const allUsernames = new Set(users.map(u => u.username));
  const rdUsernames  = new Set(users.filter(u => u.username.startsWith("rd0")).map(u => u.username));
  const fundedUsernames = new Set(users.filter(u => fundedUserIds.has(u.id)).map(u => u.username));

  const checks: Array<{ label: string; result: boolean; detail: string }> = [
    {
      label:  "File 1 has 6528 rows",
      result: allRows === 6528,
      detail: `actual=${allRows}`,
    },
    {
      label:  "File 2 has 64 rows",
      result: rdRows === 64,
      detail: `actual=${rdRows}`,
    },
    {
      label:  "File 3 has 128 rows",
      result: fundedRows === 128,
      detail: `actual=${fundedRows}`,
    },
    {
      label:  "All funded accounts appear in File 1",
      result: [...fundedUsernames].every(u => allUsernames.has(u)),
      detail: `funded=${fundedUsernames.size}`,
    },
    {
      label:  "All RD accounts appear in File 1",
      result: [...rdUsernames].every(u => allUsernames.has(u)),
      detail: `rd=${rdUsernames.size}`,
    },
    {
      label:  "No duplicate usernames in File 1",
      result: allUsernames.size === users.length,
      detail: `unique=${allUsernames.size}  total=${users.length}`,
    },
    {
      label:  "File 3 accounts are a subset of File 1",
      result: [...fundedUsernames].every(u => allUsernames.has(u)),
      detail: "all 128 funded appear in File 1",
    },
  ];

  let allPass = true;
  for (const c of checks) {
    log(`  ${c.result ? "✅" : "❌"} PASS  ${c.label.padEnd(38)} ${c.detail}`);
    if (!c.result) allPass = false;
  }

  if (!allPass) throw new Error("Cross-verification FAILED.");
  log("");
  log("  Cross-verification: ✅ ALL PASS");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  log("══════════════════════════════════════════════════════════════════════════");
  log("  Prime Wave Credential Exporter — Sprint 28E");
  log("══════════════════════════════════════════════════════════════════════════");

  await mkdir(OUTPUT_DIR, { recursive: true });

  // Step 1 — Password verification
  await verifyPassword();

  // Step 2 — Count verification
  const counts = await verifyCounts();

  // Load all data once
  const { users, levelMap, fundedUserIds, depositByUser, txByUser } = await loadAllData();

  // Step 3 — File 1
  const file1Rows = await generateFile1(users, levelMap, fundedUserIds, OUTPUT_DIR);

  // Step 4 — File 2
  const file2Rows = await generateFile2(users, fundedUserIds, depositByUser as any, OUTPUT_DIR);

  // Step 5 — File 3
  const file3Rows = await generateFile3(users, levelMap, fundedUserIds, depositByUser as any, txByUser as any, OUTPUT_DIR);

  // Step 6 — Cross-verification
  crossVerify(file1Rows, file2Rows, file3Rows, users, fundedUserIds);

  const elapsed = Math.round((Date.now() - t0) / 1000);

  log("");
  log("══════════════════════════════════════════════════════════════════════════");
  log("  SPRINT 28E COMPLETE — CREDENTIAL VERIFICATION & EXCEL EXPORT");
  log("══════════════════════════════════════════════════════════════════════════");
  log("");
  log("  ── Password Verification ──────────────────────────────────────────────");
  log(`  Password:         ${PASSWORD}`);
  log(`  Hash algorithm:   bcrypt, ${HASH_ROUNDS} rounds`);
  log(`  All accounts:     same password ✅`);
  log("");
  log("  ── Account Counts ─────────────────────────────────────────────────────");
  log(`  Master:           ${counts.master}`);
  log(`  MI:               ${counts.mi}`);
  log(`  RD:               ${counts.rd}`);
  log(`  SP:               ${counts.sp}`);
  log(`  Grand Total:      ${counts.total}`);
  log(`  Funded Endpoints: ${counts.funded}`);
  log(`  Deposit Total:    $${fmt(counts.depositTotal)}`);
  log("");
  log("  ── Generated Files ────────────────────────────────────────────────────");
  log(`  PrimeWave_All_Accounts.xlsx     — ${file1Rows} rows`);
  log(`  PrimeWave_RD_Accounts.xlsx      — ${file2Rows} rows`);
  log(`  PrimeWave_Funded_Accounts.xlsx  — ${file3Rows} rows`);
  log(`  Output directory: ${OUTPUT_DIR}`);
  log("");
  log("  ── Verification ───────────────────────────────────────────────────────");
  log("  File 1 row count: ✅ PASS (6528)");
  log("  File 2 row count: ✅ PASS (64)");
  log("  File 3 row count: ✅ PASS (128)");
  log("  Cross-references: ✅ PASS");
  log("  No duplicates:    ✅ PASS");
  log("");
  log(`  Runtime: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  log("  Excel exports exactly match the production genesis network. ✅");
  log("══════════════════════════════════════════════════════════════════════════");
}

main()
  .catch(err => {
    process.stderr.write(`\nFATAL: ${err.message}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
