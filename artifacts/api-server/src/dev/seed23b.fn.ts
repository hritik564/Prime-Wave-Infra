/**
 * runSeed23B — in-process seed, no HTTP round-trip.
 *
 * Builds the 127-account perfect binary tree:
 *   master  = Level 0 (ACTIVE)
 *   Levels 1-5 = 62 inner nodes (ACTIVE)
 *   Level 6  = 64 leaf nodes (INACTIVE)
 *
 * Each account gets a $100 approved deposit + $100 PLAN_360 investment
 * with autoCompound = false.
 *
 * Fully idempotent: checks existing user / deposit / investment before
 * creating, so repeated calls are safe and resume exactly where they stopped.
 *
 * Each user's operations are wrapped in withRetry so an ADMIN_SHUTDOWN
 * only retries that one user, never restarts the whole seed.
 */

import { prisma }               from "../config/prisma";
import { registerUser }         from "../auth/auth.service";
import { createDepositRequest } from "../deposits/deposits.service";
import { approveDeposit }       from "../admin/admin-deposits.service";
import { createInvestment }     from "../investments/investments.service";
import { AppError }             from "../middleware/error.middleware";
import { HTTP_STATUS }          from "../shared/constants";
import { logger }               from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const SEED_PASSWORD   = "RDprimewave@321!";
const SEED_PLAN       = "PLAN_360" as const;
const SEED_AMOUNT     = 100;
const SEED_NETWORK    = "BEP20" as const;
const COMPANY_WALLET  = "0xSEED23BTestCompanyWallet";
const MASTER_USERNAME = "master";
const LEAF_LEVEL      = 6; // nodes at this depth → INACTIVE

// ── Tree helpers ──────────────────────────────────────────────────────────────

interface TreeNode {
  index:       number;
  username:    string;
  parentIndex: number | null;
  position:    "LEFT" | "RIGHT" | null;
  level:       number;
  leg:         "L" | "R" | null;
}

/**
 * Builds a 127-node perfect binary tree (levels 0–6).
 *   i = 0       → master placeholder  (level 0)
 *   i = 1..126  → rd2* new accounts  (levels 1–6)
 *
 * Level 6 nodes (i = 63..126) are the 64 leaf accounts → INACTIVE.
 */
function buildTree(): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (let i = 0; i < 127; i++) {
    const level       = Math.floor(Math.log2(i + 1));
    const parentIndex = i === 0 ? null : Math.floor((i - 1) / 2);
    const position    = i === 0 ? null : (i % 2 === 1 ? "LEFT" : "RIGHT") as "LEFT" | "RIGHT";
    const leg         = position === null ? null : (position === "LEFT" ? "L" : "R");
    const username    = i === 0
      ? "RD2"
      : nodes[parentIndex!].username + (position === "LEFT" ? "L" : "R");
    nodes.push({ index: i, username, parentIndex, position, level, leg });
  }
  return nodes;
}

function indianPhone(i: number): string {
  const firstDigit = 6 + (i % 4);
  const body       = String(100_000_000 + i * 1_579).slice(1);
  return `+91${firstDigit}${body}`;
}

function fakeTxHash(slot: number): string {
  const rand = Math.floor(Math.random() * 0xffff_ffff).toString(16).padStart(8, "0");
  return `0x23bseed${slot.toString(16).padStart(4, "0")}${rand}`;
}

async function getAdminId(): Promise<string> {
  const admin = await prisma.admin.findFirst({
    where:  { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new AppError("No SUPER_ADMIN found", HTTP_STATUS.INTERNAL_SERVER_ERROR, "NO_ADMIN");
  return admin.id;
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 6,
  baseDelayMs = 12_000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) {
        logger.error({ attempt, label, err }, "Seed 23B: all retries exhausted");
        throw err;
      }
      const delay = baseDelayMs * attempt;
      logger.warn({ attempt, label, delayMs: delay }, "Seed 23B: transient error — retrying after delay");
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("unreachable");
}

// ── Public result shape ───────────────────────────────────────────────────────

export interface SeedSummary {
  totalAccounts:     number;
  usersCreated:      number;
  usersSkipped:      number;
  totalDeposits:     number;
  totalInvestments:  number;
  totalDepositValue: string;
  totalInvestValue:  string;
  activeMembers:     number;
  inactiveMembers:   number;
  treeRoot:          string;
  retryCount:        number;
  resumeCount:       number;
  executionMs:       number;
}

// ── Main seed function ────────────────────────────────────────────────────────

export async function runSeed23B(): Promise<SeedSummary> {
  const startedAt = Date.now();
  logger.info(
    "Seed 23B: starting — master=Level0, 62 inner nodes Levels1-5 (ACTIVE), 64 leaf nodes Level6 (INACTIVE)"
  );

  const nodes   = buildTree();
  const adminId = await getAdminId();

  const masterUser = await prisma.user.findFirst({
    where:  { username: MASTER_USERNAME },
    select: { id: true, referralCode: true },
  });
  if (!masterUser) throw new AppError("Master user not found", HTTP_STATUS.NOT_FOUND, "NO_MASTER");

  const idByIndex:   Record<number, string> = { 0: masterUser.id };
  const codeByIndex: Record<number, string> = { 0: masterUser.referralCode };

  let usersCreated  = 0;
  let usersSkipped  = 0;
  let activeCount   = 0;
  let inactiveCount = 0;
  let retryCount    = 0;
  let resumeCount   = 0;

  // ── Node 0: master — deposit + investment ─────────────────────────────────
  await withRetry(async () => {
    const existingDep = await prisma.depositRequest.findFirst({
      where:   { userId: masterUser.id, status: "APPROVED" },
      select:  { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (!existingDep) {
      const dep = await createDepositRequest(masterUser.id, {
        amount: SEED_AMOUNT, network: SEED_NETWORK,
        txHash: fakeTxHash(0), companyWallet: COMPANY_WALLET,
      });
      await approveDeposit(adminId, dep.id);
      logger.info("Seed 23B: master deposit created & approved");
    }

    const existingInv = await prisma.investment.findFirst({
      where:   { userId: masterUser.id, status: { in: ["ACTIVE", "MATURED"] } },
      select:  { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (!existingInv) {
      await createInvestment(masterUser.id, {
        amount: SEED_AMOUNT, planType: SEED_PLAN, autoCompound: false,
      });
      logger.info("Seed 23B: master investment created");
    }
  }, "master:deposit+investment");

  activeCount++; // master is always ACTIVE

  // ── Nodes 1–126: new seed users (levels 1–6) ──────────────────────────────
  for (let i = 1; i < nodes.length; i++) {
    const node        = nodes[i];
    const usernameLC  = node.username.toLowerCase();
    const email       = `${usernameLC}@primewave.live`;
    const phone       = indianPhone(i);
    const sponsorCode = codeByIndex[node.parentIndex!];

    let localRetries = 0;

    const result = await withRetry(async () => {
      if (localRetries > 0) retryCount++;
      localRetries++;

      // ── 1. Register (or resume if already exists) ──────────────────────────
      const existing = await prisma.user.findFirst({
        where:  { username: usernameLC },
        select: { id: true, referralCode: true },
      });

      let uid:  string;
      let code: string;

      if (existing) {
        uid  = existing.id;
        code = existing.referralCode;
        logger.info({ username: usernameLC }, "Seed 23B: user already exists — skipping");
        resumeCount++;
      } else {
        const { user } = await registerUser({
          email,
          username:     node.username,
          password:     SEED_PASSWORD,
          firstName:    node.username,
          lastName:     "Seed",
          phone,
          referralCode: sponsorCode,
          leg:          node.leg!,
        });
        uid  = user.id;
        code = user.referralCode;

        // Leaf nodes at level 6 are INACTIVE
        if (node.level === LEAF_LEVEL) {
          await prisma.user.update({ where: { id: uid }, data: { status: "INACTIVE" } });
        }
        logger.info(
          { username: usernameLC, userId: uid, level: node.level },
          "Seed 23B: user created"
        );
        usersCreated++;
      }

      // ── 2. Deposit ─────────────────────────────────────────────────────────
      const existingDep = await prisma.depositRequest.findFirst({
        where:   { userId: uid, status: "APPROVED" },
        select:  { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (!existingDep) {
        const dep = await createDepositRequest(uid, {
          amount: SEED_AMOUNT, network: SEED_NETWORK,
          txHash: fakeTxHash(i), companyWallet: COMPANY_WALLET,
        });
        await approveDeposit(adminId, dep.id);
      }

      // ── 3. Investment ──────────────────────────────────────────────────────
      const existingInv = await prisma.investment.findFirst({
        where:   { userId: uid, status: { in: ["ACTIVE", "MATURED"] } },
        select:  { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (!existingInv) {
        await createInvestment(uid, {
          amount: SEED_AMOUNT, planType: SEED_PLAN, autoCompound: false,
        });
      }

      return { uid, code };
    }, `user:${usernameLC}`);

    idByIndex[i]   = result.uid;
    codeByIndex[i] = result.code;

    if (node.level === LEAF_LEVEL) { inactiveCount++; } else { activeCount++; }
  }

  // Account for skipped (existing) users
  usersSkipped = nodes.length - 1 - usersCreated; // all non-master nodes minus created

  const totalAccounts = nodes.length; // 127
  const executionMs   = Date.now() - startedAt;

  logger.info(
    { totalAccounts, usersCreated, usersSkipped, activeCount, inactiveCount, retryCount, executionMs },
    "Seed 23B: completed"
  );

  return {
    totalAccounts,
    usersCreated,
    usersSkipped,
    totalDeposits:     totalAccounts,
    totalInvestments:  totalAccounts,
    totalDepositValue: `$${totalAccounts * SEED_AMOUNT}`,
    totalInvestValue:  `$${totalAccounts * SEED_AMOUNT}`,
    activeMembers:     activeCount,
    inactiveMembers:   inactiveCount,
    treeRoot:          "master → RD2L (LEFT), RD2R (RIGHT)",
    retryCount,
    resumeCount,
    executionMs,
  };
}
