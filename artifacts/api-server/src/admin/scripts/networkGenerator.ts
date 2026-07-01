/**
 * Prime Wave Network Generator — Sprint 28C.2 (topology corrected)
 *
 * Three-tier launch network with MASTER as the binary tree root:
 *
 *   MASTER
 *   ├── LEFT  → MI0001
 *   └── RIGHT → MI0002   ← both arms filled at root level
 *
 *   MI (Infrastructure) — 63 accounts, BFS nodes 1–63 below master
 *   RD (Root Distributors) — 64 accounts, BFS nodes 64–127 below master
 *   SP (Spill) — 100 accounts per RD (50 LEFT + 50 RIGHT linear chains)
 *
 * BFS formula (master = index 0, nodes are 1-indexed):
 *   Parent of node i = floor((i-1) / 2)   [0 = master, 1–63 = MI, 64–127 = RD]
 *   Position:          odd i → LEFT,  even i → RIGHT
 *
 * Transition nodes:
 *   mi0031 (node 31): LEFT → mi0063, RIGHT → rd0001
 *   mi0063 (node 63): LEFT → rd0064, RIGHT → (empty)
 *
 * Referral structure:
 *   Every SP account is sponsored DIRECTLY by its owning RD.
 *   → Each RD ends with directReferralCount = 100.
 *
 * Binary structure:
 *   RD → SP1(L) → SP2(L) → … → SP50(L)   (left linear chain)
 *   RD → SP51(R) → SP52(R) → … → SP100(R) (right linear chain)
 *
 * Counts:
 *   MI = 63  |  RD = 64  |  SP = 6400  |  Grand Total = 6527
 *   Master LEFT subtree: 3264  |  Master RIGHT subtree: 3263
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run generate-network
 *
 * Idempotent: safe to re-run after any interruption.
 * Progress stored in system_settings (key: NETWORK_GENERATOR_PROGRESS).
 */

import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { prisma } from "../../config/prisma.js";
import { placeUserTx } from "../../binary/binary.service.js";

// ── Constants ─────────────────────────────────────────────────────────────────
//
// OUTPUT_DIR resolves via process.cwd() — this is needed because the generator
// code is bundled into index.mjs when imported by the server. In that context,
// import.meta.url points to index.mjs, not networkGenerator.mjs.
// Both standalone (pnpm run generate-network) and server-hosted runs share
// CWD = /home/runner/workspace/artifacts/api-server.
// Two levels up reaches the workspace root.

const PASSWORD         = "Master@PrimeWave2025!";
const MASTER_REFERRAL  = "MASTERROOT";
const PROGRESS_KEY     = "NETWORK_GENERATOR_PROGRESS";
const OUTPUT_DIR       = path.resolve(process.cwd(), "../../generated");

// Tier sizing
const MI_COUNT         = 63;   // BFS nodes 1–63 (levels 1–6)
const RD_COUNT         = 64;   // BFS nodes 64–127 (level 7)
const SP_LEFT          = 50;
const SP_RIGHT         = 50;
const SP_PER_RD        = SP_LEFT + SP_RIGHT;   // 100 per RD
const SP_TOTAL         = RD_COUNT * SP_PER_RD; // 6400

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

// MI:  mi0001 … mi0063
const miUsername = (i: number) => `mi${String(i).padStart(4, "0")}`;
const miEmail    = (i: number) => `${miUsername(i)}@primewave.network`;

// RD:  rd0001 … rd0064   (these are the level-7 nodes, index j = 1..64)
const rdUsername = (j: number) => `rd${String(j).padStart(4, "0")}`;
const rdEmail    = (j: number) => `${rdUsername(j)}@primewave.network`;

// SP:  sp000001 … sp006400
const spUsername = (i: number) => `sp${String(i).padStart(6, "0")}`;
const spEmail    = (i: number) => `${spUsername(i)}@primewave.network`;

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
    create: { key: PROGRESS_KEY, value: JSON.stringify(p), description: "Sprint 28C.1 network generator progress" },
  });
}

// ── Core: single account registration ────────────────────────────────────────
//
// Mirrors registerUser() exactly:
//   user + wallet created atomically, sponsor counters incremented,
//   referral history recorded, placeUserTx called for binary placement.
//
// Password hash is pre-computed once (same for all accounts).
// Idempotent: if username already exists, returns existing record immediately.

async function registerNetworkUser(
  username:     string,
  email:        string,
  passwordHash: string,
  firstName:    string,
  lastName:     string,
  sponsorCode:  string,       // referral code of the direct sponsor
  leg:          "L" | "R",
): Promise<CreatedUser> {

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
        status:       "INACTIVE",   // Genesis accounts start INACTIVE; activation is a separate business process
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

// ── Phase 1: Infrastructure (MI + RD tier accounts, 127 total) ───────────────
//
// BFS-ordered binary tree — master is the root (index 0), nodes are 1-indexed:
//   Parent of node i = floor((i-1) / 2)   [0 = master, 1–63 = MI, 64–127 = RD]
//   Position:          odd  i → LEFT,  even i → RIGHT
//   Level from master: floor(log2(i+1))
//
//   Nodes 1–63   → MI accounts (mi0001…mi0063)  levels 1–6 below master
//   Nodes 64–127 → RD accounts (rd0001…rd0064)  level 7 below master
//
//   Master:  LEFT → mi0001 (node 1),  RIGHT → mi0002 (node 2)
//   mi0031 (node 31): LEFT → mi0063 (node 63),  RIGHT → rd0001 (node 64)
//   mi0063 (node 63): LEFT → rd0064 (node 127),  RIGHT → (empty)
//
// Both tiers are generated in a single BFS pass.

async function generateInfrastructure(
  passwordHash: string,
): Promise<{ miCodeMap: Map<number, string>; rdCodeMap: Map<number, string> }> {
  log("─── Phase 1: Infrastructure (127 accounts: 63 MI + 64 RD) ───────────────");

  const miCodeMap = new Map<number, string>(); // node 1–63 → referralCode
  const rdCodeMap = new Map<number, string>(); // node 64–127 → referralCode (by RD index 1–64)

  // Pre-load existing accounts
  const existingMI = await prisma.user.findMany({
    where:  { username: { startsWith: "mi0" } },
    select: { username: true, referralCode: true },
  });
  for (const u of existingMI) {
    miCodeMap.set(parseInt(u.username.slice(2), 10), u.referralCode);
  }
  const existingRD = await prisma.user.findMany({
    where:  { username: { startsWith: "rd0" } },
    select: { username: true, referralCode: true },
  });
  for (const u of existingRD) {
    const j = parseInt(u.username.slice(2), 10); // rd0001 → 1
    rdCodeMap.set(j, u.referralCode);
  }
  log(`  Resuming: ${miCodeMap.size} MI + ${rdCodeMap.size} RD already exist.`);

  const INFRA_TOTAL = MI_COUNT + RD_COUNT; // 127

  for (let node = 1; node <= INFRA_TOTAL; node++) {
    const isMI  = node <= MI_COUNT;          // nodes 1–63
    const rdIdx = node - MI_COUNT;            // 1–64 for RD nodes

    // Check if already created
    if (isMI && miCodeMap.has(node))          continue;
    if (!isMI && rdCodeMap.has(rdIdx))        continue;

    // Determine sponsor + leg using new BFS formula:
    //   parent index = floor((node-1)/2)  [0=master, 1-63=MI, 64-127=RD]
    //   position: odd node → LEFT, even node → RIGHT
    let sponsorCode: string;
    const parentIdx = Math.floor((node - 1) / 2);
    const leg: "L" | "R" = (node % 2 === 1) ? "L" : "R";

    if (parentIdx === 0) {
      // Direct child of master: node 1 = mi0001 (LEFT), node 2 = mi0002 (RIGHT)
      sponsorCode = MASTER_REFERRAL;
    } else if (parentIdx <= MI_COUNT) {
      // Parent is a MI account
      sponsorCode = miCodeMap.get(parentIdx)!;
    } else {
      // Parent is a RD account
      sponsorCode = rdCodeMap.get(parentIdx - MI_COUNT)!;
    }

    const username = isMI ? miUsername(node) : rdUsername(rdIdx);
    const email    = isMI ? miEmail(node)    : rdEmail(rdIdx);

    const user = await registerNetworkUser(
      username,
      email,
      passwordHash,
      isMI ? "MI" : "RD",
      isMI ? `Account ${String(node).padStart(4, "0")}` : `Distributor ${String(rdIdx).padStart(4, "0")}`,
      sponsorCode,
      leg,
    );

    if (isMI) {
      miCodeMap.set(node, user.referralCode);
    } else {
      rdCodeMap.set(rdIdx, user.referralCode);
    }

    if (node % 16 === 0 || node === INFRA_TOTAL) {
      log(`  Infra: ${node}/${INFRA_TOTAL}`);
    }
  }

  log(`  Phase 1 complete — ${miCodeMap.size} MI + ${rdCodeMap.size} RD.`);
  return { miCodeMap, rdCodeMap };
}

// ── Phase 2: SP chains (6400 accounts, 100 per RD) ───────────────────────────
//
// For RD chain j (1–64), binary root = RD account j (rd0001…rd0064).
//
// Referral structure (corrected):
//   ALL 100 SP accounts under an RD have sponsorId = RD.id
//   → directReferralCount of every RD = 100 after this phase.
//
// Binary structure (unchanged — greedy deepest):
//   LEFT chain:  sp[offset+1]…sp[offset+50]   each placed at DEEPEST LEFT of RD
//   RIGHT chain: sp[offset+51]…sp[offset+100]  each placed at DEEPEST RIGHT of RD
//
//   Because all SPs share the same sponsorId (= RD), placeUserTx starts from
//   RD's leftDeepestNodeId / rightDeepestNodeId on each call, which always
//   points to the deepest available slot → produces a perfect linear chain.

async function generateSpChain(
  chainIndex:   number,    // 1–64
  rdCode:       string,    // referralCode of the owning RD account
  passwordHash: string,
): Promise<void> {
  const spOffset = (chainIndex - 1) * SP_PER_RD;  // 0, 100, 200, …

  // LEFT chain: SP[offset+1]…SP[offset+50], all sponsored by RD, placed LEFT
  for (let k = 1; k <= SP_LEFT; k++) {
    const spIdx = spOffset + k;
    await registerNetworkUser(
      spUsername(spIdx),
      spEmail(spIdx),
      passwordHash,
      "SP",
      `Spill ${String(spIdx).padStart(6, "0")}`,
      rdCode,   // ← DIRECT sponsor = owning RD (not previous SP)
      "L",
    );
  }

  // RIGHT chain: SP[offset+51]…SP[offset+100], all sponsored by RD, placed RIGHT
  for (let k = 1; k <= SP_RIGHT; k++) {
    const spIdx = spOffset + SP_LEFT + k;
    await registerNetworkUser(
      spUsername(spIdx),
      spEmail(spIdx),
      passwordHash,
      "SP",
      `Spill ${String(spIdx).padStart(6, "0")}`,
      rdCode,   // ← DIRECT sponsor = owning RD (not previous SP)
      "R",
    );
  }

  const lo = spUsername(spOffset + 1).toUpperCase();
  const hi = spUsername(spOffset + 100).toUpperCase();
  log(`  SP chain ${String(chainIndex).padStart(2, "0")}/64 done  [${lo}–${hi}]  RD sponsor: rd${String(chainIndex).padStart(4, "0")}`);
}

// ── Verification ──────────────────────────────────────────────────────────────

async function runVerification(): Promise<boolean> {
  log("─── Verification ────────────────────────────────────────────────────────");

  const [miCount, rdCount, spCount, walletCount, investCount, depositCount, withdrawCount] =
    await prisma.$transaction([
      prisma.user.count({ where: { username: { startsWith: "mi0" } } }),
      prisma.user.count({ where: { username: { startsWith: "rd0" } } }),
      prisma.user.count({ where: { username: { startsWith: "sp0" } } }),
      prisma.wallet.count({
        where: {
          user: {
            OR: [
              { username: { startsWith: "mi0" } },
              { username: { startsWith: "rd0" } },
              { username: { startsWith: "sp0" } },
            ],
          },
        },
      }),
      prisma.investment.count(),
      prisma.depositRequest.count(),
      prisma.withdrawalRequest.count(),
    ]);

  const totalUsers = miCount + rdCount + spCount;

  // Duplicate checks
  const dupUsername = await prisma.user.groupBy({
    by: ["username"],
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
      ],
    },
    having: { username: { _count: { gt: 1 } } },
  });
  const dupEmail = await prisma.user.groupBy({
    by: ["email"],
    where: { email: { endsWith: "@primewave.network" } },
    having: { email: { _count: { gt: 1 } } },
  });

  // Binary integrity: ALL generated accounts must have binaryParentId.
  // In the new topology both mi0001 (LEFT of master) and mi0002 (RIGHT of master)
  // have master as their binaryParentId — no exceptions.
  const missingBinaryParent = await prisma.user.count({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
      ],
      binaryParentId: null,
    },
  });

  // Master must have exactly 2 binary children (mi0001 LEFT + mi0002 RIGHT)
  const masterUser = await prisma.user.findUnique({
    where:  { username: "master" },
    select: { id: true },
  });
  const masterChildCount = masterUser
    ? await prisma.user.count({ where: { binaryParentId: masterUser.id } })
    : -1;

  // Referral integrity: every generated account must have a sponsorId
  const missingSponsors = await prisma.user.count({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
      ],
      sponsorId: null,
    },
  });

  // RD referral count: every RD account must have directReferralCount = 100
  const rdBadReferralCount = await prisma.user.count({
    where: {
      username: { startsWith: "rd0" },
      NOT: { directReferralCount: SP_PER_RD },
    },
  });

  // SP sponsorship: every SP account must be sponsored by an RD account
  const spBadSponsor = await prisma.user.count({
    where: {
      username: { startsWith: "sp0" },
      sponsor: { NOT: { username: { startsWith: "rd0" } } },
    },
  });

  // Referral history count
  const refHistoryCount = await prisma.referralHistory.count({
    where: {
      OR: [
        { userId: { in: await prisma.user.findMany({ where: { username: { startsWith: "mi0" } }, select: { id: true } }).then(us => us.map(u => u.id)) } },
        { userId: { in: await prisma.user.findMany({ where: { username: { startsWith: "rd0" } }, select: { id: true } }).then(us => us.map(u => u.id)) } },
        { userId: { in: await prisma.user.findMany({ where: { username: { startsWith: "sp0" } }, select: { id: true } }).then(us => us.map(u => u.id)) } },
      ],
    },
  });

  const checks = [
    { label: "MI accounts",                        expected: MI_COUNT,              actual: miCount,              pass: miCount === MI_COUNT },
    { label: "RD accounts",                        expected: RD_COUNT,              actual: rdCount,              pass: rdCount === RD_COUNT },
    { label: "SP accounts",                        expected: SP_TOTAL,              actual: spCount,              pass: spCount === SP_TOTAL },
    { label: "Grand total",                        expected: MI_COUNT+RD_COUNT+SP_TOTAL, actual: totalUsers,      pass: totalUsers === MI_COUNT+RD_COUNT+SP_TOTAL },
    { label: "Wallets",                            expected: MI_COUNT+RD_COUNT+SP_TOTAL, actual: walletCount,     pass: walletCount === MI_COUNT+RD_COUNT+SP_TOTAL },
    { label: "Investments (must be 0)",            expected: 0,                     actual: investCount,          pass: investCount === 0 },
    { label: "Deposits (must be 0)",               expected: 0,                     actual: depositCount,         pass: depositCount === 0 },
    { label: "Withdrawals (must be 0)",            expected: 0,                     actual: withdrawCount,        pass: withdrawCount === 0 },
    { label: "Duplicate usernames",                expected: 0,                     actual: dupUsername.length,   pass: dupUsername.length === 0 },
    { label: "Duplicate emails",                   expected: 0,                     actual: dupEmail.length,      pass: dupEmail.length === 0 },
    { label: "Binary integrity (no orphans)",      expected: 0,                     actual: missingBinaryParent,  pass: missingBinaryParent === 0 },
    { label: "Master binary children (must be 2)", expected: 2,                     actual: masterChildCount,     pass: masterChildCount === 2 },
    { label: "Referral integrity (all have sponsor)", expected: 0,                  actual: missingSponsors,      pass: missingSponsors === 0 },
    { label: "RD directReferralCount = 100",       expected: 0,                     actual: rdBadReferralCount,   pass: rdBadReferralCount === 0 },
    { label: "SP sponsor = owning RD",             expected: 0,                     actual: spBadSponsor,         pass: spBadSponsor === 0 },
    { label: "Referral history records",           expected: MI_COUNT+RD_COUNT+SP_TOTAL, actual: refHistoryCount, pass: refHistoryCount === MI_COUNT+RD_COUNT+SP_TOTAL },
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
  type UserRow = {
    username:      string;
    status:        string;
    binaryParent:  { username: string } | null;
    sponsor:       { username: string } | null;
    wallet:        { depositWallet: unknown; incomeWallet: unknown } | null;
  };

  const allUsers = await prisma.user.findMany({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
      ],
    },
    select: {
      username:     true,
      status:       true,
      binaryParent: { select: { username: true } },
      sponsor:      { select: { username: true } },
      wallet:       { select: { depositWallet: true, incomeWallet: true } },
    },
    orderBy: { username: "asc" },
  }) as UserRow[];

  const miUsers = allUsers.filter(u => u.username.startsWith("mi"));
  const rdUsers = allUsers.filter(u => u.username.startsWith("rd"));
  const spUsers = allUsers.filter(u => u.username.startsWith("sp"));

  // ── Workbook 1: PrimeWave_Network.xlsx ──────────────────────────────────────

  const wb1 = XLSX.utils.book_new();

  // Sheet 1: Infrastructure (MI)
  const infraSheet = miUsers.map(u => {
    const idx   = parseInt(u.username.slice(2), 10);
    const level = Math.floor(Math.log2(idx + 1)); // level from master: mi0001/mi0002 = 1, etc.
    return {
      Username:           u.username.toUpperCase(),
      Password:           PASSWORD,
      Level:              level,
      "Binary Parent":    u.binaryParent?.username?.toUpperCase() ?? "—",
      "Referral Sponsor": u.sponsor?.username?.toUpperCase() ?? "—",
      Status:             u.status,
    };
  });
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(infraSheet), "Infrastructure Accounts");

  // Sheet 2: RD Accounts (64 root distributors)
  const rdSheet = rdUsers.map(u => ({
    Username:           u.username.toUpperCase(),
    Password:           PASSWORD,
    "Binary Parent":    u.binaryParent?.username?.toUpperCase() ?? "—",
    "Referral Sponsor": u.sponsor?.username?.toUpperCase() ?? "—",
    Status:             u.status,
  }));
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(rdSheet), "RD Accounts");

  // Sheet 3: Spill Accounts (6400 SP accounts)
  const spSheet = spUsers.map(u => {
    const rdParent = u.sponsor?.username?.toUpperCase() ?? "—";
    // Derive chain index and side from SP index
    const spIdx    = parseInt(u.username.slice(2), 10); // sp000001 → 1
    const chainIdx = Math.ceil(spIdx / SP_PER_RD);      // 1–64
    const posInChain = ((spIdx - 1) % SP_PER_RD) + 1;  // 1–100
    const side     = posInChain <= SP_LEFT ? "LEFT" : "RIGHT";
    const depth    = posInChain <= SP_LEFT ? posInChain : posInChain - SP_LEFT;
    return {
      Username:           u.username.toUpperCase(),
      Password:           PASSWORD,
      "RD Parent":        rdParent,
      Side:               side,
      Depth:              depth,
      "Binary Parent":    u.binaryParent?.username?.toUpperCase() ?? "—",
      "Referral Sponsor": rdParent,
      Status:             u.status,
    };
  });
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(spSheet), "Spill Accounts");

  // Sheet 4: Statistics
  const stats = [
    { Metric: "MI Accounts (Infrastructure)",  Value: MI_COUNT },
    { Metric: "RD Accounts (Root Distributors)", Value: RD_COUNT },
    { Metric: "SP Accounts (Spill)",             Value: SP_TOTAL },
    { Metric: "Grand Total",                     Value: MI_COUNT + RD_COUNT + SP_TOTAL },
  ];
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(stats), "Statistics");

  const netPath = path.join(OUTPUT_DIR, "PrimeWave_Network.xlsx");
  XLSX.writeFile(wb1, netPath);
  log(`  Written: ${netPath}`);

  // ── Workbook 2: PrimeWave_Credentials.xlsx ──────────────────────────────────

  const wb2 = XLSX.utils.book_new();

  const credentials = allUsers.map(u => {
    const type =
      u.username.startsWith("mi") ? "MI (Infrastructure)"   :
      u.username.startsWith("rd") ? "RD (Root Distributor)" :
                                    "SP (Spill)";
    return {
      Username:           u.username.toUpperCase(),
      Password:           PASSWORD,
      "Account Type":     type,
      "Binary Parent":    u.binaryParent?.username?.toUpperCase() ?? "—",
      "Referral Sponsor": u.sponsor?.username?.toUpperCase() ?? "—",
      Status:             u.status,
    };
  });
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(credentials), "All Accounts");

  const credPath = path.join(OUTPUT_DIR, "PrimeWave_Credentials.xlsx");
  XLSX.writeFile(wb2, credPath);
  log(`  Written: ${credPath}`);
}

// ── Exported entry point (called from index.ts startup hook) ─────────────────

export async function runGenerator(): Promise<void> {
  return main();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  log("══════════════════════════════════════════════════════════════════════════");
  log("  Prime Wave Network Generator — Sprint 28C.1");
  log(`  Target: ${MI_COUNT} MI + ${RD_COUNT} RD + ${SP_TOTAL} SP = ${MI_COUNT + RD_COUNT + SP_TOTAL} total`);
  log("══════════════════════════════════════════════════════════════════════════");

  log("Hashing password (once)…");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  log("Password hash ready.");

  const progress = await loadProgress();
  log(`Progress: infraComplete=${progress.infraComplete}  spChainsComplete=${progress.rdChainsComplete}/64`);

  // ── Phase 1: Infrastructure ────────────────────────────────────────────────
  let rdCodeMap: Map<number, string>;

  if (!progress.infraComplete) {
    const result = await generateInfrastructure(passwordHash);
    rdCodeMap = result.rdCodeMap;
    progress.infraComplete = true;
    await saveProgress(progress);
  } else {
    log("Phase 1 already complete — loading RD codes from DB.");
    rdCodeMap = new Map<number, string>();
    const rdUsers = await prisma.user.findMany({
      where:  { username: { startsWith: "rd0" } },
      select: { username: true, referralCode: true },
      orderBy: { username: "asc" },
    });
    for (const u of rdUsers) {
      rdCodeMap.set(parseInt(u.username.slice(2), 10), u.referralCode);
    }
    log(`  Loaded ${rdCodeMap.size} RD account codes.`);
  }

  // ── Phase 2: SP chains (64 × 100 accounts) ────────────────────────────────
  log("─── Phase 2: SP chains (64 chains × 100 accounts) ──────────────────────");

  for (let chain = progress.rdChainsComplete + 1; chain <= RD_COUNT; chain++) {
    const rdCode = rdCodeMap.get(chain);
    if (!rdCode) throw new Error(`RD code missing for chain ${chain} (rd${String(chain).padStart(4, "0")})`);

    await generateSpChain(chain, rdCode, passwordHash);
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
  log("  SPRINT 28C.1 COMPLETE");
  log(`  MI (Infrastructure) : ${MI_COUNT}   (mi0001–mi0063, levels 1–6)`);
  log(`  RD (Root Distrib.)  : ${RD_COUNT}   (rd0001–rd0064, level 7)`);
  log(`  SP (Spill)          : ${SP_TOTAL}  (sp000001–sp006400, 100 per RD)`);
  log(`  Grand Total         : ${MI_COUNT + RD_COUNT + SP_TOTAL}`);
  log(`  Referral structure  : all SP accounts sponsored directly by owning RD`);
  log(`  Binary structure    : 50L + 50R linear chains per RD (unchanged)`);
  log(`  Each RD             : directReferralCount = 100`);
  log(`  Wallets             : ${MI_COUNT + RD_COUNT + SP_TOTAL} created (all balances = 0)`);
  log(`  Excel files         : ${OUTPUT_DIR}`);
  log(`  Runtime             : ${minutes}m ${seconds}s`);
  log(`  Verification        : ${allPass ? "✅ ALL PASS" : "❌ SOME FAILED — review above"}`);
  log(`  Ready for           : Sprint 28D (Funding Engine)`);
  log("══════════════════════════════════════════════════════════════════════════");

  if (!allPass) process.exit(1);
}

// Guard: only auto-execute when invoked directly as a standalone script.
// When imported by index.ts (via runGenerator()), the server calls main()
// explicitly — this block must not fire on module load.
const isStandaloneScript =
  process.argv[1] != null &&
  (process.argv[1].endsWith("networkGenerator.mjs") ||
   process.argv[1].endsWith("networkGenerator.ts"));

if (isStandaloneScript) {
  main()
    .catch(err => {
      console.error("FATAL:", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
