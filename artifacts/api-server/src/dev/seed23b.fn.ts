/**
 * runSeed23B — in-process seed, no HTTP round-trip.
 *
 * Builds the 63-account perfect binary tree (master + 62 rd2* users),
 * each with a $100 deposit + $100 PLAN_360 investment.
 *
 * Fully idempotent: checks for existing user / deposit / investment
 * before creating, so repeated calls are safe.
 *
 * Each user's operations are wrapped in withRetry so a transient DB
 * restart only retries that one user rather than aborting the whole seed.
 */

import { prisma }              from "../config/prisma";
import { registerUser }        from "../auth/auth.service";
import { createDepositRequest }from "../deposits/deposits.service";
import { approveDeposit }      from "../admin/admin-deposits.service";
import { createInvestment }    from "../investments/investments.service";
import { AppError }            from "../middleware/error.middleware";
import { HTTP_STATUS }         from "../shared/constants";
import { logger }              from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const SEED_PASSWORD   = "RDprimewave@321!";
const SEED_PLAN       = "PLAN_360" as const;
const SEED_AMOUNT     = 100;
const SEED_NETWORK    = "BEP20" as const;
const COMPANY_WALLET  = "0xSEED23BTestCompanyWallet";
const MASTER_USERNAME = "master";

// ── Tree helpers ──────────────────────────────────────────────────────────────

interface TreeNode {
  index:       number;
  username:    string;
  parentIndex: number | null;
  position:    "LEFT" | "RIGHT" | null;
  level:       number;
  leg:         "L" | "R" | null;
}

function buildTree(): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (let i = 0; i < 63; i++) {
    const level       = Math.floor(Math.log2(i + 1));
    const parentIndex = i === 0 ? null : Math.floor((i - 1) / 2);
    const position    = i === 0 ? null : (i % 2 === 1 ? "LEFT" : "RIGHT") as "LEFT" | "RIGHT";
    const leg         = position === null ? null : (position === "LEFT" ? "L" : "R");
    const username    = i === 0 ? "RD2" : nodes[parentIndex!].username + (position === "LEFT" ? "L" : "R");
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
  totalDeposits:     number;
  totalInvestments:  number;
  totalDepositValue: string;
  totalInvestValue:  string;
  activeMembers:     number;
  inactiveMembers:   number;
  treeRoot:          string;
}

// ── Main seed function ────────────────────────────────────────────────────────

export async function runSeed23B(): Promise<SeedSummary> {
  logger.info("Seed 23B: starting in-process — master = Level 0, 62 new users at levels 1-5");

  const nodes   = buildTree();
  const adminId = await getAdminId();

  const masterUser = await prisma.user.findFirst({
    where:  { username: MASTER_USERNAME },
    select: { id: true, referralCode: true },
  });
  if (!masterUser) throw new AppError("Master user not found", HTTP_STATUS.NOT_FOUND, "NO_MASTER");

  const idByIndex:   Record<number, string> = { 0: masterUser.id };
  const codeByIndex: Record<number, string> = { 0: masterUser.referralCode };

  let activeCount   = 0;
  let inactiveCount = 0;

  // ── Node 0: master — deposit + investment ────────────────────────────────────
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

  // ── Nodes 1–62: new seed users ───────────────────────────────────────────────
  for (let i = 1; i < nodes.length; i++) {
    const node        = nodes[i];
    const usernameLC  = node.username.toLowerCase();
    const email       = `${usernameLC}@primewave.live`;
    const phone       = indianPhone(i);
    const sponsorCode = codeByIndex[node.parentIndex!];

    // Each user's full lifecycle is retried as a unit
    const result = await withRetry(async () => {
      // 1. Register (or resume if already exists)
      const existing = await prisma.user.findFirst({
        where:  { username: usernameLC },
        select: { id: true, referralCode: true },
      });

      let uid:  string;
      let code: string;

      if (existing) {
        uid  = existing.id;
        code = existing.referralCode;
        logger.info({ username: usernameLC }, "Seed 23B: user already exists — skipping register");
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

        if (node.level === 5) {
          await prisma.user.update({ where: { id: uid }, data: { status: "INACTIVE" } });
        }
        logger.info({ username: usernameLC, userId: uid, level: node.level }, "Seed 23B: user created");
      }

      // 2. Deposit
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

      // 3. Investment
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

    if (node.level === 5) { inactiveCount++; } else { activeCount++; }
  }

  const totalAccounts = 1 + (nodes.length - 1); // master + 62
  logger.info({ totalAccounts, activeCount, inactiveCount }, "Seed 23B: all done");

  return {
    totalAccounts,
    totalDeposits:     totalAccounts,
    totalInvestments:  totalAccounts,
    totalDepositValue: `$${totalAccounts * SEED_AMOUNT}`,
    totalInvestValue:  `$${totalAccounts * SEED_AMOUNT}`,
    activeMembers:     activeCount,
    inactiveMembers:   inactiveCount,
    treeRoot:          "master → RD2L (LEFT), RD2R (RIGHT)",
  };
}
