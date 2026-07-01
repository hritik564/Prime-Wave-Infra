/**
 * Prime Wave Network Generator — Sprint 28H (Genesis path rearchitecture)
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
 * ── Architecture (Sprint 28H) ──────────────────────────────────────────────
 *
 * OLD path (Sprint 28C–28G):
 *   registerUser → placeUserTx (6 DB calls, FOR UPDATE locks, cache read) →
 *   updateBinaryCache (2×N DB calls, N grows 1→54 per half-chain)
 *   Total: (10 + 2N) calls per account → ~398,000 calls for 6,527 accounts
 *
 * NEW path (Sprint 28H):
 *   genesisInsertUser (3 DB calls, binaryParentId pre-computed in memory) →
 *   repairAllBinaryCache (2 SQL statements total after all accounts)
 *   Total: 4 calls per account + 2 SQL statements → ~26,100 calls
 *   Reduction: 93.4%
 *
 * Key insight: the generator knows the exact binary parent for every account
 * before creating it (deterministic BFS for infra, sequential chain tracking
 * for SP).  The runtime placement engine exists to resolve this dynamically
 * from the cache — an overhead the generator does not need.
 *
 * Production APIs (placeUserTx, updateBinaryCache, registerUser) are
 * completely unchanged.
 *
 * Counts:
 *   MI = 63  |  RD = 64  |  SP = 6400  |  Grand Total = 6527
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
import { genesisInsertUser, repairAllBinaryCache } from "./genesisPlacement.js";

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

interface MinimalUser {
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

// ── Per-chain timing accumulator ──────────────────────────────────────────────
//
// Tracks only newly-created accounts (skipped existing accounts are not
// included in txMs / totalMs averages so the numbers reflect true creation
// cost, not idempotency check cost).

interface TimingAccum {
  created:  number;   // newly created accounts
  skipped:  number;   // already-existing accounts (idempotency hits)
  existMs:  number;   // cumulative idempotency check time (new only)
  txMs:     number;   // cumulative transaction time (new only)
  totalMs:  number;   // cumulative total time (new only)
}

let _ta: TimingAccum = { created: 0, skipped: 0, existMs: 0, txMs: 0, totalMs: 0 };

function _resetTiming() {
  _ta = { created: 0, skipped: 0, existMs: 0, txMs: 0, totalMs: 0 };
}

function _logTiming(label: string) {
  if (_ta.created === 0 && _ta.skipped === 0) return;
  const avg = (v: number) => (_ta.created > 0 ? (v / _ta.created).toFixed(0) : "—");
  log(
    `  [TIMING ${label}] created=${_ta.created}  skipped=${_ta.skipped}  ` +
    `total=${avg(_ta.totalMs)}ms  tx=${avg(_ta.txMs)}ms  existCheck=${avg(_ta.existMs)}ms`,
  );
}

// ── Core: single account creation (new genesis path) ─────────────────────────
//
// Idempotent: if username already exists, returns existing record without
// touching the DB beyond the initial findUnique.
//
// When the account is new: calls genesisInsertUser (3 DB calls in a single
// transaction — no FOR UPDATE locks, no cache reads, no cache writes).
//
// The binary parent is passed in directly by the caller; this function has
// no knowledge of tree structure.

async function genesisInsertOrSkip(
  username:       string,
  email:          string,
  passwordHash:   string,
  firstName:      string,
  lastName:       string,
  sponsorId:      string,
  binaryParentId: string,
  position:       "LEFT" | "RIGHT",
): Promise<MinimalUser> {

  const t0 = Date.now();

  // ── Idempotency check ────────────────────────────────────────────────────────
  const t_exist0 = Date.now();
  const existing = await prisma.user.findUnique({
    where:  { username },
    select: { id: true, username: true, referralCode: true },
  });
  const existMs = Date.now() - t_exist0;

  if (existing) {
    _ta.skipped++;
    return existing;
  }

  // ── Create via dedicated genesis path (3 DB calls) ───────────────────────────
  const t_tx0 = Date.now();
  const user = await genesisInsertUser({
    username,
    email,
    passwordHash,
    firstName,
    lastName,
    referralCode:   generateReferralCode(),
    sponsorId,
    binaryParentId,
    position,
  });
  const txMs    = Date.now() - t_tx0;
  const totalMs = Date.now() - t0;

  _ta.created++;
  _ta.existMs  += existMs;
  _ta.txMs     += txMs;
  _ta.totalMs  += totalMs;

  // Log first 3 new accounts per chain for spot-check visibility
  if (_ta.created <= 3) {
    log(`    [ACCT ${username}] total=${totalMs}ms  tx=${txMs}ms  existCheck=${existMs}ms`);
  }

  return user;
}

// ── Phase 1: Infrastructure (MI + RD tier accounts, 127 total) ───────────────
//
// BFS-ordered binary tree — master is the root (index 0), nodes are 1-indexed:
//   Parent of node i = floor((i-1) / 2)   [0 = master, 1–63 = MI, 64–127 = RD]
//   Position:          odd  i → LEFT,  even i → RIGHT
//
//   For every infrastructure account:
//     sponsorId = binaryParentId = the BFS parent's user ID
//
//   This matches the existing topology: each MI/RD account was sponsored by
//   and binary-placed under the same parent.
//
// The generator tracks user IDs (not referral codes) to pass sponsorId and
// binaryParentId directly to genesisInsertUser.

async function generateInfrastructure(
  passwordHash: string,
  masterId:     string,
): Promise<{ miIdMap: Map<number, string>; rdIdMap: Map<number, string> }> {
  log("─── Phase 1: Infrastructure (127 accounts: 63 MI + 64 RD) ───────────────");

  const miIdMap = new Map<number, string>(); // node 1–63 → user ID
  const rdIdMap = new Map<number, string>(); // RD index 1–64 → user ID

  // Pre-load existing accounts
  const existingMI = await prisma.user.findMany({
    where:  { username: { startsWith: "mi0" } },
    select: { username: true, id: true },
  });
  for (const u of existingMI) {
    miIdMap.set(parseInt(u.username.slice(2), 10), u.id);
  }
  const existingRD = await prisma.user.findMany({
    where:  { username: { startsWith: "rd0" } },
    select: { username: true, id: true },
  });
  for (const u of existingRD) {
    const j = parseInt(u.username.slice(2), 10); // rd0001 → 1
    rdIdMap.set(j, u.id);
  }
  log(`  Resuming: ${miIdMap.size} MI + ${rdIdMap.size} RD already exist.`);

  const INFRA_TOTAL = MI_COUNT + RD_COUNT; // 127

  for (let node = 1; node <= INFRA_TOTAL; node++) {
    const isMI  = node <= MI_COUNT;        // nodes 1–63
    const rdIdx = node - MI_COUNT;         // 1–64 for RD nodes

    // Skip if already created
    if (isMI && miIdMap.has(node))   continue;
    if (!isMI && rdIdMap.has(rdIdx)) continue;

    // Determine binary parent ID using BFS formula:
    //   parent index = floor((node-1)/2)  [0=master, 1-63=MI, 64-127=RD]
    //   position: odd node → LEFT, even node → RIGHT
    const parentIdx = Math.floor((node - 1) / 2);
    const position: "LEFT" | "RIGHT" = (node % 2 === 1) ? "LEFT" : "RIGHT";

    let parentId: string;
    if (parentIdx === 0) {
      parentId = masterId;
    } else if (parentIdx <= MI_COUNT) {
      parentId = miIdMap.get(parentIdx)!;
    } else {
      parentId = rdIdMap.get(parentIdx - MI_COUNT)!;
    }

    // sponsorId = binaryParentId: infrastructure accounts are sponsored by
    // and placed under the same node (their BFS parent).
    const username = isMI ? miUsername(node) : rdUsername(rdIdx);
    const email    = isMI ? miEmail(node)    : rdEmail(rdIdx);

    const user = await genesisInsertOrSkip(
      username,
      email,
      passwordHash,
      isMI ? "MI" : "RD",
      isMI ? `Account ${String(node).padStart(4, "0")}` : `Distributor ${String(rdIdx).padStart(4, "0")}`,
      parentId,   // sponsorId
      parentId,   // binaryParentId (same as sponsor for infra)
      position,
    );

    if (isMI) miIdMap.set(node, user.id);
    else      rdIdMap.set(rdIdx, user.id);

    if (node % 16 === 0 || node === INFRA_TOTAL) {
      log(`  Infra: ${node}/${INFRA_TOTAL}`);
    }
  }

  log(`  Phase 1 complete — ${miIdMap.size} MI + ${rdIdMap.size} RD.`);
  return { miIdMap, rdIdMap };
}

// ── Phase 2: SP chains (6400 accounts, 100 per RD) ───────────────────────────
//
// For each RD (rdId), generate 50 LEFT then 50 RIGHT SP accounts.
//
// Sponsor structure:
//   All 100 SP accounts under an RD have sponsorId = rdId.
//
// Binary structure:
//   LEFT chain: SP[offset+1] is placed directly under RD (position=LEFT).
//               SP[offset+2] is placed under SP[offset+1], and so on.
//               Each SP is the LEFT child of the previous SP.
//   RIGHT chain: same, RIGHT direction.
//
// The generator tracks the deepest node in-memory for each direction:
//   leftDeepest  — starts at rdId, advances to each newly-created LEFT SP
//   rightDeepest — starts at rdId, advances to each newly-created RIGHT SP
//
// Resumption: if some accounts in the chain already exist (partial run),
//   genesisInsertOrSkip returns the existing account's ID, naturally
//   advancing the deepest tracker through all existing accounts before
//   creating the first new one.  No DB query needed to reconstruct state.
//
// No per-account cache updates.  repairAllBinaryCache() rebuilds the
// complete cache in two SQL statements after all chains are done.

async function generateSpChain(
  chainIndex:   number,    // 1–64
  rdId:         string,    // user ID of the owning RD account
  passwordHash: string,
): Promise<void> {
  const spOffset = (chainIndex - 1) * SP_PER_RD;  // 0, 100, 200, …

  // In-memory deepest-node trackers.
  // For a fresh chain: both start at rdId (first SP goes directly under RD).
  // For a partial chain: the first existing accounts advance the tracker
  //   through the already-created portion before any new creation happens.
  let leftDeepest  = rdId;
  let rightDeepest = rdId;

  _resetTiming();

  // LEFT chain: SP[offset+1]…SP[offset+50]
  for (let k = 1; k <= SP_LEFT; k++) {
    const spIdx = spOffset + k;
    const user = await genesisInsertOrSkip(
      spUsername(spIdx),
      spEmail(spIdx),
      passwordHash,
      "SP",
      `Spill ${String(spIdx).padStart(6, "0")}`,
      rdId,          // sponsorId = owning RD (all 100 SPs share the same sponsor)
      leftDeepest,   // binaryParentId = current deepest LEFT slot
      "LEFT",
    );
    leftDeepest = user.id;  // advance tracker to the account just created/skipped
  }

  _logTiming(`chain${String(chainIndex).padStart(2, "0")}-LEFT`);
  _resetTiming();

  // RIGHT chain: SP[offset+51]…SP[offset+100]
  for (let k = 1; k <= SP_RIGHT; k++) {
    const spIdx = spOffset + SP_LEFT + k;
    const user = await genesisInsertOrSkip(
      spUsername(spIdx),
      spEmail(spIdx),
      passwordHash,
      "SP",
      `Spill ${String(spIdx).padStart(6, "0")}`,
      rdId,          // sponsorId = owning RD
      rightDeepest,  // binaryParentId = current deepest RIGHT slot
      "RIGHT",
    );
    rightDeepest = user.id;
  }

  _logTiming(`chain${String(chainIndex).padStart(2, "0")}-RIGHT`);

  const lo = spUsername(spOffset + 1).toUpperCase();
  const hi = spUsername(spOffset + SP_PER_RD).toUpperCase();
  log(`  SP chain ${String(chainIndex).padStart(2, "0")}/64 done  [${lo}–${hi}]  RD: ${rdId.slice(0, 8)}…`);
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
  const genUserIds = await prisma.user.findMany({
    where: {
      OR: [
        { username: { startsWith: "mi0" } },
        { username: { startsWith: "rd0" } },
        { username: { startsWith: "sp0" } },
      ],
    },
    select: { id: true },
  });
  const genIds = genUserIds.map(u => u.id);
  const refHistoryCount = await prisma.referralHistory.count({
    where: { userId: { in: genIds } },
  });

  // ── Cache integrity checks (Sprint 28H) ─────────────────────────────────────
  //
  // After repairAllBinaryCache():
  //   1. Every node with a LEFT child must have a non-null leftDeepestNodeId.
  //   2. Every node with a RIGHT child must have a non-null rightDeepestNodeId.
  //   3. The leftDeepestNodeId target must have no LEFT child (it IS the leaf).
  //   4. The rightDeepestNodeId target must have no RIGHT child.

  type CountRow = { count: bigint };

  const [
    cacheLeftMissing,
    cacheRightMissing,
    cacheLeftStale,
    cacheRightStale,
  ] = await Promise.all([
    // Nodes with a LEFT child but leftDeepestNodeId = NULL
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM   users u
      WHERE  EXISTS (SELECT 1 FROM users c WHERE c."binaryParentId" = u.id AND c.position = 'LEFT')
        AND  u."leftDeepestNodeId" IS NULL
    `,
    // Nodes with a RIGHT child but rightDeepestNodeId = NULL
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM   users u
      WHERE  EXISTS (SELECT 1 FROM users c WHERE c."binaryParentId" = u.id AND c.position = 'RIGHT')
        AND  u."rightDeepestNodeId" IS NULL
    `,
    // leftDeepestNodeId targets that still have a LEFT child (stale pointer)
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM   users u
      WHERE  u."leftDeepestNodeId" IS NOT NULL
        AND  EXISTS (
          SELECT 1 FROM users c
          WHERE  c."binaryParentId" = u."leftDeepestNodeId" AND c.position = 'LEFT'
        )
    `,
    // rightDeepestNodeId targets that still have a RIGHT child (stale pointer)
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count
      FROM   users u
      WHERE  u."rightDeepestNodeId" IS NOT NULL
        AND  EXISTS (
          SELECT 1 FROM users c
          WHERE  c."binaryParentId" = u."rightDeepestNodeId" AND c.position = 'RIGHT'
        )
    `,
  ]);

  const n = (rows: CountRow[]) => Number(rows[0].count);

  const checks = [
    { label: "MI accounts",                             expected: MI_COUNT,                   actual: miCount,               pass: miCount === MI_COUNT },
    { label: "RD accounts",                             expected: RD_COUNT,                   actual: rdCount,               pass: rdCount === RD_COUNT },
    { label: "SP accounts",                             expected: SP_TOTAL,                   actual: spCount,               pass: spCount === SP_TOTAL },
    { label: "Grand total",                             expected: MI_COUNT+RD_COUNT+SP_TOTAL, actual: totalUsers,            pass: totalUsers === MI_COUNT+RD_COUNT+SP_TOTAL },
    { label: "Wallets",                                 expected: MI_COUNT+RD_COUNT+SP_TOTAL, actual: walletCount,           pass: walletCount === MI_COUNT+RD_COUNT+SP_TOTAL },
    { label: "Investments (must be 0)",                 expected: 0,                          actual: investCount,           pass: investCount === 0 },
    { label: "Deposits (must be 0)",                    expected: 0,                          actual: depositCount,          pass: depositCount === 0 },
    { label: "Withdrawals (must be 0)",                 expected: 0,                          actual: withdrawCount,         pass: withdrawCount === 0 },
    { label: "Duplicate usernames",                     expected: 0,                          actual: dupUsername.length,    pass: dupUsername.length === 0 },
    { label: "Duplicate emails",                        expected: 0,                          actual: dupEmail.length,       pass: dupEmail.length === 0 },
    { label: "Binary integrity (no orphans)",           expected: 0,                          actual: missingBinaryParent,   pass: missingBinaryParent === 0 },
    { label: "Master binary children (must be 2)",      expected: 2,                          actual: masterChildCount,      pass: masterChildCount === 2 },
    { label: "Referral integrity (all have sponsor)",   expected: 0,                          actual: missingSponsors,       pass: missingSponsors === 0 },
    { label: "RD directReferralCount = 100",            expected: 0,                          actual: rdBadReferralCount,    pass: rdBadReferralCount === 0 },
    { label: "SP sponsor = owning RD",                  expected: 0,                          actual: spBadSponsor,          pass: spBadSponsor === 0 },
    { label: "Referral history records",                expected: MI_COUNT+RD_COUNT+SP_TOTAL, actual: refHistoryCount,       pass: refHistoryCount === MI_COUNT+RD_COUNT+SP_TOTAL },
    { label: "Cache: left missing (should be 0)",       expected: 0,                          actual: n(cacheLeftMissing),   pass: n(cacheLeftMissing) === 0 },
    { label: "Cache: right missing (should be 0)",      expected: 0,                          actual: n(cacheRightMissing),  pass: n(cacheRightMissing) === 0 },
    { label: "Cache: left stale pointers (should be 0)",expected: 0,                          actual: n(cacheLeftStale),     pass: n(cacheLeftStale) === 0 },
    { label: "Cache: right stale pointers (should be 0)",expected: 0,                         actual: n(cacheRightStale),    pass: n(cacheRightStale) === 0 },
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

  const infraSheet = miUsers.map(u => {
    const idx   = parseInt(u.username.slice(2), 10);
    const level = Math.floor(Math.log2(idx + 1));
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

  const rdSheet = rdUsers.map(u => ({
    Username:           u.username.toUpperCase(),
    Password:           PASSWORD,
    "Binary Parent":    u.binaryParent?.username?.toUpperCase() ?? "—",
    "Referral Sponsor": u.sponsor?.username?.toUpperCase() ?? "—",
    Status:             u.status,
  }));
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(rdSheet), "RD Accounts");

  const spSheet = spUsers.map(u => {
    const rdParent   = u.sponsor?.username?.toUpperCase() ?? "—";
    const spIdx      = parseInt(u.username.slice(2), 10);
    const chainIdx   = Math.ceil(spIdx / SP_PER_RD);
    const posInChain = ((spIdx - 1) % SP_PER_RD) + 1;
    const side       = posInChain <= SP_LEFT ? "LEFT" : "RIGHT";
    const depth      = posInChain <= SP_LEFT ? posInChain : posInChain - SP_LEFT;
    return {
      Username:           u.username.toUpperCase(),
      Password:           PASSWORD,
      "RD Parent":        rdParent,
      "Chain":            chainIdx,
      Side:               side,
      Depth:              depth,
      "Binary Parent":    u.binaryParent?.username?.toUpperCase() ?? "—",
      "Referral Sponsor": rdParent,
      Status:             u.status,
    };
  });
  XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(spSheet), "Spill Accounts");

  const stats = [
    { Metric: "MI Accounts (Infrastructure)",   Value: MI_COUNT },
    { Metric: "RD Accounts (Root Distributors)", Value: RD_COUNT },
    { Metric: "SP Accounts (Spill)",              Value: SP_TOTAL },
    { Metric: "Grand Total",                      Value: MI_COUNT + RD_COUNT + SP_TOTAL },
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
  log("  Prime Wave Network Generator — Sprint 28H");
  log(`  Target: ${MI_COUNT} MI + ${RD_COUNT} RD + ${SP_TOTAL} SP = ${MI_COUNT + RD_COUNT + SP_TOTAL} total`);
  log("  Architecture: genesis path (genesisInsertUser + repairAllBinaryCache)");
  log("══════════════════════════════════════════════════════════════════════════");

  log("Hashing password (once)…");
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  log("Password hash ready.");

  // Resolve master account ID (required for infra phase parent resolution)
  const masterUser = await prisma.user.findUnique({
    where:  { referralCode: MASTER_REFERRAL },
    select: { id: true },
  });
  if (!masterUser) throw new Error(`Master account not found (referralCode=${MASTER_REFERRAL})`);
  const masterId = masterUser.id;

  const progress = await loadProgress();
  log(`Progress: infraComplete=${progress.infraComplete}  spChainsComplete=${progress.rdChainsComplete}/64`);

  // ── Phase 1: Infrastructure ────────────────────────────────────────────────

  let rdIdMap: Map<number, string>; // RD index 1–64 → user ID

  if (!progress.infraComplete) {
    const result = await generateInfrastructure(passwordHash, masterId);
    rdIdMap = result.rdIdMap;
    progress.infraComplete = true;
    await saveProgress(progress);
  } else {
    log("Phase 1 already complete — loading RD IDs from DB.");
    rdIdMap = new Map<number, string>();
    const rdUsers = await prisma.user.findMany({
      where:   { username: { startsWith: "rd0" } },
      select:  { username: true, id: true },
      orderBy: { username: "asc" },
    });
    for (const u of rdUsers) {
      rdIdMap.set(parseInt(u.username.slice(2), 10), u.id);
    }
    log(`  Loaded ${rdIdMap.size} RD account IDs.`);
  }

  // ── Phase 2: SP chains (64 × 100 accounts) ────────────────────────────────
  log("─── Phase 2: SP chains (64 chains × 100 accounts) ──────────────────────");

  for (let chain = progress.rdChainsComplete + 1; chain <= RD_COUNT; chain++) {
    const rdId = rdIdMap.get(chain);
    if (!rdId) throw new Error(`RD ID missing for chain ${chain} (rd${String(chain).padStart(4, "0")})`);

    await generateSpChain(chain, rdId, passwordHash);
    progress.rdChainsComplete = chain;
    await saveProgress(progress);
  }

  log("Phase 2 complete.");

  // ── Phase 2.5: Bulk binary cache repair ───────────────────────────────────
  //
  // All 6,528 accounts now have correct binaryParentId + position.
  // Two recursive SQL CTEs compute and write every node's deepest-node
  // pointers in a single pass each — replacing ~326,000 individual DB calls.
  log("─── Phase 2.5: Bulk binary cache repair ─────────────────────────────────");
  const t_repair = Date.now();
  const { leftUpdated, rightUpdated } = await repairAllBinaryCache();
  const repairMs = Date.now() - t_repair;
  log(`  leftDeepestNodeId  updated: ${leftUpdated} nodes`);
  log(`  rightDeepestNodeId updated: ${rightUpdated} nodes`);
  log(`  Cache repair time: ${repairMs}ms`);

  // ── Verification ──────────────────────────────────────────────────────────
  const allPass = await runVerification();

  // ── Excel ──────────────────────────────────────────────────────────────────
  await generateExcel();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  log("══════════════════════════════════════════════════════════════════════════");
  log("  SPRINT 28H COMPLETE");
  log(`  MI (Infrastructure) : ${MI_COUNT}   (mi0001–mi0063, levels 1–6)`);
  log(`  RD (Root Distrib.)  : ${RD_COUNT}   (rd0001–rd0064, level 7)`);
  log(`  SP (Spill)          : ${SP_TOTAL}  (sp000001–sp006400, 100 per RD)`);
  log(`  Grand Total         : ${MI_COUNT + RD_COUNT + SP_TOTAL}`);
  log(`  Referral structure  : all SP accounts sponsored directly by owning RD`);
  log(`  Binary structure    : 50L + 50R linear chains per RD`);
  log(`  Each RD             : directReferralCount = 100`);
  log(`  Wallets             : ${MI_COUNT + RD_COUNT + SP_TOTAL} created (all balances = 0)`);
  log(`  Cache repair        : ${leftUpdated}L + ${rightUpdated}R nodes in ${repairMs}ms`);
  log(`  Excel files         : ${OUTPUT_DIR}`);
  log(`  Runtime             : ${minutes}m ${seconds}s`);
  log(`  Verification        : ${allPass ? "✅ ALL PASS" : "❌ SOME FAILED — review above"}`);
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
