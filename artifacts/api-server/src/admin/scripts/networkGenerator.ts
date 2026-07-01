/**
 * Prime Wave Network Generator — Sprint 28C
 *
 * Generates the complete launch network:
 *   - 127 MI infrastructure accounts (7-level complete binary tree)
 *   - 6400 RD expansion accounts (64 chains of 100: 50L + 50R per MI Level-7)
 *   - Total: 6527 accounts
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run generate-network
 *
 * Idempotent: safe to re-run after any interruption.
 * Progress stored in system_settings (key: NETWORK_GENERATOR_PROGRESS).
 * Password: Master@PrimeWave2025! (hashed once, reused for all accounts).
 */

import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { prisma } from "../../config/prisma.js";
import { placeUserTx } from "../../binary/binary.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Constants ─────────────────────────────────────────────────────────────────

const PASSWORD            = "Master@PrimeWave2025!";
const MASTER_REFERRAL     = "MASTERROOT";
const PROGRESS_KEY        = "NETWORK_GENERATOR_PROGRESS";
const OUTPUT_DIR          = path.resolve(__dirname, "../../../../../generated");

const MI_COUNT            = 127;  // 2^7 − 1 (7-level complete binary tree)
const RD_CHAINS           = 64;   // one per MI Level-7 account
const CHAIN_LEFT          = 50;
const CHAIN_RIGHT         = 50;
const RD_PER_CHAIN        = CHAIN_LEFT + CHAIN_RIGHT;  // 100
const RD_TOTAL            = RD_CHAINS * RD_PER_CHAIN;  // 6400

// ── Types ─────────────────────────────────────────────────────────────────────

interface Progress {
  infraComplete:    boolean;
  rdChainsComplete: number;   // 0–64
  startedAt:        string;
  lastUpdatedAt:    string;
}

interface CreatedUser {
  id:           string;
  username:     string;
  referralCode: string;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const miUsername = (i: number) => `mi${String(i).padStart(4, "0")}`;
const rdUsername = (i: number) => `rd${String(i).padStart(6, "0")}`;
const miEmail    = (i: number) => `${miUsername(i)}@primewave.network`;
const rdEmail    = (i: number) => `${rdUsername(i)}@primewave.network`;

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ── Progress persistence ──────────────────────────────────────────────────────

async function loadProgress(): Promise<Progress> {
  const row = await prisma.systemSettings.findUnique({ where: { key: PROGRESS_KEY } });
  if (!row) {
    return {
      infraComplete:    false,
      rdChainsComplete: 0,
      startedAt:        new Date().toISOString(),
      lastUpdatedAt:    new Date().toISOString(),
    };
  }
  return JSON.parse(row.value) as Progress;
}

async function saveProgress(p: Progress): Promise<void> {
  p.lastUpdatedAt = new Date().toISOString();
  await prisma.systemSettings.upsert({
    where:  { key: PROGRESS_KEY },
    update: { value: JSON.stringify(p) },
    create: { key: PROGRESS_KEY, value: JSON.stringify(p), description: "Sprint 28C network generator progress" },
  });
}

// ── Core: single account registration ────────────────────────────────────────
//
// Mirrors registerUser() exactly:
//   - user + wallet created atomically
//   - sponsor counters incremented
//   - referral history recorded
//   - placeUserTx called for binary placement
//
// Difference: password hash is pre-computed (hash once, reuse for all accounts).
// Idempotent: if username already exists, returns existing record immediately.

async function registerNetworkUser(
  username:      string,
  email:         string,
  passwordHash:  string,
  firstName:     string,
  lastName:      string,
  sponsorCode:   string,   // referral code of the sponsor
  leg:           "L" | "R",
): Promise<CreatedUser> {

  // Idempotency check — skip if already created
  const existing = await prisma.user.findUnique({
    where:  { username },
    select: { id: true, username: true, referralCode: true },
  });
  if (existing) return existing;

  const position: "LEFT" | "RIGHT" = leg === "L" ? "LEFT" : "RIGHT";
  const referralCode = generateReferralCode();

  return prisma.$transaction(async (tx) => {
    const sponsor = await tx.user.findUnique({
      where:  { referralCode: sponsorCode },
      select: { id: true },
    });
    if (!sponsor) throw new Error(`Sponsor not found: referralCode=${sponsorCode} for user=${username}`);
    const sponsorId = sponsor.id;

    const user = await tx.user.create({
      data: {
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        referralCode,
        referredBy: sponsorId,
        sponsorId,
        wallet: {
          create: { depositWallet: 0, incomeWallet: 0, withdrawalWallet: 0 },
        },
      },
      select: { id: true, username: true, referralCode: true },
    });

    await tx.user.update({
      where: { id: sponsorId },
      data: {
        directReferralCount: { increment: 1 },
        ...(position === "LEFT"
          ? { directLeftCount:  { increment: 1 } }
          : { directRightCount: { increment: 1 } }),
      },
    });

    await tx.referralHistory.create({
      data: { sponsorId, userId: user.id, leg: position },
    });

    await placeUserTx(tx, sponsorId, user.id, position);

    return user;
  }, { timeout: 30_000 });
}

// ── Phase 1: MI Infrastructure (127 accounts) ─────────────────────────────────
//
// BFS-ordered complete binary tree (1-indexed):
//   Parent of node i     = floor(i / 2)
//   Position of node i   = even → LEFT, odd → RIGHT   (i > 1)
//   Level of node i      = floor(log2(i)) + 1
//   MI Level-7 accounts  = nodes 64–127

async function generateInfrastructure(passwordHash: string): Promise<Map<number, string>> {
  log("─── Phase 1: MI Infrastructure (127 accounts) ───────────────────────────");

  // Pre-load any already-created MI accounts → map: index → referralCode
  const codeMap = new Map<number, string>();
  const existingMI = await prisma.user.findMany({
    where:  { username: { startsWith: "mi0" } },
    select: { username: true, referralCode: true },
  });
  for (const u of existingMI) {
    const idx = parseInt(u.username.slice(2), 10); // "mi0001" → 1
    codeMap.set(idx, u.referralCode);
  }
  log(`  Resuming: ${codeMap.size} MI accounts already exist.`);

  for (let i = 1; i <= MI_COUNT; i++) {
    if (codeMap.has(i)) continue;

    let sponsorCode: string;
    let leg: "L" | "R";

    if (i === 1) {
      sponsorCode = MASTER_REFERRAL;
      leg         = "L";
    } else {
      const parentIdx = Math.floor(i / 2);
      sponsorCode = codeMap.get(parentIdx)!;
      leg         = i % 2 === 0 ? "L" : "R";
    }

    const user = await registerNetworkUser(
      miUsername(i),
      miEmail(i),
      passwordHash,
      "MI",
      `Account ${String(i).padStart(4, "0")}`,
      sponsorCode,
      leg,
    );
    codeMap.set(i, user.referralCode);

    if (i % 16 === 0 || i === MI_COUNT) {
      log(`  MI: ${i}/${MI_COUNT}`);
    }
  }

  log(`  Phase 1 complete — ${codeMap.size} MI accounts.`);
  return codeMap;
}

// ── Phase 2: RD Expansion (6400 accounts across 64 chains) ───────────────────
//
// Chain j (1–64) belongs to MI Level-7 account: node index 63+j.
// RD indices for chain j: [(j-1)*100 + 1] .. [(j-1)*100 + 100]
//   LEFT  chain: RD[(j-1)*100 +  1] .. RD[(j-1)*100 + 50]  — under MI_L7_j LEFT
//   RIGHT chain: RD[(j-1)*100 + 51] .. RD[(j-1)*100 + 100] — under MI_L7_j RIGHT
//
// Referral sponsor = previous account in the same chain (sequential chain).

async function generateRdChain(
  chainIndex:  number,   // 1–64
  miCode:      string,   // referralCode of the MI Level-7 root for this chain
  passwordHash: string,
): Promise<void> {
  const rdOffset = (chainIndex - 1) * RD_PER_CHAIN;

  // LEFT chain (50 accounts, linear, each spawns the next on its LEFT)
  let prevCode = miCode;
  for (let k = 1; k <= CHAIN_LEFT; k++) {
    const rdIdx = rdOffset + k;
    const user  = await registerNetworkUser(
      rdUsername(rdIdx),
      rdEmail(rdIdx),
      passwordHash,
      "RD",
      `Network ${String(rdIdx).padStart(6, "0")}`,
      prevCode,
      "L",
    );
    prevCode = user.referralCode; // walk forward (works for existing users too)
  }

  // RIGHT chain (50 accounts, linear, each spawns the next on its RIGHT)
  prevCode = miCode; // reset to MI root for right leg
  for (let k = 1; k <= CHAIN_RIGHT; k++) {
    const rdIdx = rdOffset + CHAIN_LEFT + k;
    const user  = await registerNetworkUser(
      rdUsername(rdIdx),
      rdEmail(rdIdx),
      passwordHash,
      "RD",
      `Network ${String(rdIdx).padStart(6, "0")}`,
      prevCode,
      "R",
    );
    prevCode = user.referralCode;
  }

  const lo = rdUsername(rdOffset + 1).toUpperCase();
  const hi = rdUsername(rdOffset + 100).toUpperCase();
  log(`  RD chain ${String(chainIndex).padStart(2, "0")}/64 done  [${lo}–${hi}]`);
}

// ── Verification ──────────────────────────────────────────────────────────────

async function runVerification(): Promise<boolean> {
  log("─── Verification ────────────────────────────────────────────────────────");

  const [miCount, rdCount, walletCount, investCount, depositCount, withdrawCount] =
    await prisma.$transaction([
      prisma.user.count({ where: { username: { startsWith: "mi0" } } }),
      prisma.user.count({ where: { username: { startsWith: "rd0" } } }),
      prisma.wallet.count({
        where: {
          user: {
            OR: [
              { username: { startsWith: "mi0" } },
              { username: { startsWith: "rd0" } },
            ],
          },
        },
      }),
      prisma.investment.count(),
      prisma.depositRequest.count(),
      prisma.withdrawalRequest.count(),
    ]);

  const totalUsers  = miCount + rdCount;
  const dupUsername = await prisma.user.groupBy({
    by: ["username"],
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
      ],
    },
    having: { username: { _count: { gt: 1 } } },
  });
  const dupEmail = await prisma.user.groupBy({
    by: ["email"],
    where: {
      email: { endsWith: "@primewave.network" },
    },
    having: { email: { _count: { gt: 1 } } },
  });

  // Binary integrity: every MI/RD user (except master-sponsored root MI0001
  // which has binaryParentId = null as it is the root under master) must have
  // a binaryParentId set.
  const missingBinaryParent = await prisma.user.count({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
      ],
      binaryParentId: null,
      NOT: { username: "mi0001" }, // mi0001 is the only valid root
    },
  });

  // Referral integrity: every MI/RD user must have a sponsorId
  const missingSponsors = await prisma.user.count({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
      ],
      sponsorId: null,
    },
  });

  const checks = [
    { label: "Total users",              expected: MI_COUNT + RD_TOTAL,  actual: totalUsers,          pass: totalUsers === MI_COUNT + RD_TOTAL },
    { label: "MI accounts",              expected: MI_COUNT,              actual: miCount,             pass: miCount === MI_COUNT },
    { label: "RD accounts",              expected: RD_TOTAL,              actual: rdCount,             pass: rdCount === RD_TOTAL },
    { label: "Wallets",                  expected: MI_COUNT + RD_TOTAL,  actual: walletCount,         pass: walletCount === MI_COUNT + RD_TOTAL },
    { label: "Investments (must be 0)",  expected: 0,                     actual: investCount,         pass: investCount === 0 },
    { label: "Deposits (must be 0)",     expected: 0,                     actual: depositCount,        pass: depositCount === 0 },
    { label: "Withdrawals (must be 0)",  expected: 0,                     actual: withdrawCount,       pass: withdrawCount === 0 },
    { label: "Duplicate usernames",      expected: 0,                     actual: dupUsername.length,  pass: dupUsername.length === 0 },
    { label: "Duplicate emails",         expected: 0,                     actual: dupEmail.length,     pass: dupEmail.length === 0 },
    { label: "Binary integrity",         expected: 0,                     actual: missingBinaryParent, pass: missingBinaryParent === 0 },
    { label: "Referral integrity",       expected: 0,                     actual: missingSponsors,     pass: missingSponsors === 0 },
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

async function generateExcel(): Promise<void> {
  log("─── Generating Excel files ──────────────────────────────────────────────");
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Fetch all generated users with relations
  const allUsers = await prisma.user.findMany({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
      ],
    },
    select: {
      username:      true,
      status:        true,
      binaryParent:  { select: { username: true } },
      sponsor:       { select: { username: true } },
      wallet:        { select: { depositWallet: true, incomeWallet: true } },
    },
    orderBy: { username: "asc" },
  });

  const miUsers = allUsers.filter(u => u.username.startsWith("mi"));
  const rdUsers = allUsers.filter(u => u.username.startsWith("rd"));

  // ── Workbook 1: PrimeWave_Network.xlsx ──────────────────────────────────────

  const wb1 = XLSX.utils.book_new();

  // Sheet 1: Infrastructure Accounts
  const infra = miUsers.map(u => {
    const idx   = parseInt(u.username.slice(2), 10);
    const level = Math.floor(Math.log2(idx)) + 1;
    return {
      Username:         u.username.toUpperCase(),
      Password:         PASSWORD,
      Level:            level,
      "Binary Parent":  u.binaryParent?.username?.toUpperCase() ?? "—",
      "Referral Sponsor": u.sponsor?.username?.toUpperCase() ?? "—",
      Status:           u.status,
    };
  });
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(infra), "Infrastructure Accounts");

  // Sheet 2: RD Accounts
  const rdSheet = rdUsers.map((u, i) => ({
    Username:  u.username.toUpperCase(),
    Password:  PASSWORD,
    "RD Number": i + 1,
  }));
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(rdSheet), "RD Accounts");

  // Sheet 3: Statistics
  const stats = [
    { Metric: "Infrastructure Count", Value: MI_COUNT },
    { Metric: "RD Count",             Value: RD_TOTAL },
    { Metric: "Expansion Count",      Value: RD_TOTAL },
    { Metric: "Grand Total",          Value: MI_COUNT + RD_TOTAL },
  ];
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(stats), "Statistics");

  const net_path = path.join(OUTPUT_DIR, "PrimeWave_Network.xlsx");
  XLSX.writeFile(wb1, net_path);
  log(`  Written: ${net_path}`);

  // ── Workbook 2: PrimeWave_Credentials.xlsx ──────────────────────────────────

  const wb2 = XLSX.utils.book_new();

  const credentials = allUsers.map(u => {
    const isMI    = u.username.startsWith("mi");
    const idx     = parseInt(u.username.slice(isMI ? 2 : 2), 10);
    const level   = isMI ? Math.floor(Math.log2(idx)) + 1 : null;
    return {
      Username:           u.username.toUpperCase(),
      Password:           PASSWORD,
      "Account Type":     isMI ? "MI (Infrastructure)" : "RD (Expansion)",
      Level:              level ?? "",
      "Referral Sponsor": u.sponsor?.username?.toUpperCase() ?? "—",
      "Binary Parent":    u.binaryParent?.username?.toUpperCase() ?? "—",
      "Deposit Wallet":   0,
      "Investment Wallet": 0,
      Status:             u.status,
    };
  });
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(credentials), "All Accounts");

  const cred_path = path.join(OUTPUT_DIR, "PrimeWave_Credentials.xlsx");
  XLSX.writeFile(wb2, cred_path);
  log(`  Written: ${cred_path}`);
}

// ── Exported entry point (called from index.ts startup hook) ─────────────────

export async function runGenerator(): Promise<void> {
  return main();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  log("══════════════════════════════════════════════════════════════════════════");
  log("  Prime Wave Network Generator — Sprint 28C");
  log(`  Target: ${MI_COUNT} MI + ${RD_TOTAL} RD = ${MI_COUNT + RD_TOTAL} total accounts`);
  log("══════════════════════════════════════════════════════════════════════════");

  // Hash password once — same hash reused for all accounts (same password)
  log("Hashing password (once)…");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  log("Password hash ready.");

  // Load progress
  const progress = await loadProgress();
  log(`Progress: infraComplete=${progress.infraComplete}  rdChainsComplete=${progress.rdChainsComplete}/64`);

  // ── Phase 1: MI Infrastructure ────────────────────────────────────────────
  let miCodeMap: Map<number, string>;

  if (!progress.infraComplete) {
    miCodeMap = await generateInfrastructure(passwordHash);
    progress.infraComplete = true;
    await saveProgress(progress);
  } else {
    log("Phase 1 already complete — loading MI codes from DB.");
    miCodeMap = new Map<number, string>();
    const miUsers = await prisma.user.findMany({
      where:  { username: { startsWith: "mi0" } },
      select: { username: true, referralCode: true },
    });
    for (const u of miUsers) {
      miCodeMap.set(parseInt(u.username.slice(2), 10), u.referralCode);
    }
    log(`  Loaded ${miCodeMap.size} MI account codes.`);
  }

  // ── Phase 2: RD Expansion (64 chains) ─────────────────────────────────────
  log("─── Phase 2: RD Expansion (64 chains × 100 accounts) ───────────────────");

  for (let chain = progress.rdChainsComplete + 1; chain <= RD_CHAINS; chain++) {
    const miNodeIdx = 63 + chain; // MI Level-7 node: 64..127
    const miCode    = miCodeMap.get(miNodeIdx);
    if (!miCode) throw new Error(`MI code missing for node ${miNodeIdx} (chain ${chain})`);

    await generateRdChain(chain, miCode, passwordHash);
    progress.rdChainsComplete = chain;
    await saveProgress(progress);
  }

  log("Phase 2 complete.");

  // ── Verification ──────────────────────────────────────────────────────────
  const allPass = await runVerification();

  // ── Excel ──────────────────────────────────────────────────────────────────
  await generateExcel();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  log("══════════════════════════════════════════════════════════════════════════");
  log(`  SPRINT 28C COMPLETE`);
  log(`  Files created : PrimeWave_Network.xlsx, PrimeWave_Credentials.xlsx`);
  log(`  Generator     : registerNetworkUser() mirrors registerUser() exactly`);
  log(`  Users         : ${MI_COUNT} MI + ${RD_TOTAL} RD = ${MI_COUNT + RD_TOTAL}`);
  log(`  Binary tree   : 7-level MI tree + 64 linear RD chains (50L+50R each)`);
  log(`  Referral chain: sequential within each chain`);
  log(`  Wallets       : ${MI_COUNT + RD_TOTAL} created (depositWallet=0, incomeWallet=0)`);
  log(`  Investments   : 0  |  Deposits: 0  |  Withdrawals: 0`);
  log(`  Excel files   : ${OUTPUT_DIR}`);
  log(`  Runtime       : ${minutes}m ${seconds}s`);
  log(`  Verification  : ${allPass ? "✅ ALL PASS" : "❌ SOME FAILED — review above"}`);
  log(`  Ready for     : Sprint 28D (Funding Engine)`);
  log("══════════════════════════════════════════════════════════════════════════");

  if (!allPass) process.exit(1);
}

main()
  .catch(err => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
