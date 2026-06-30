/**
 * Sprint 23B — Development Seed Dataset
 *
 * DELETE /api/dev/seed/23b       — wipe all rd2* seed users, reset master to clean state
 * POST   /api/dev/seed/23b       — 63-account perfect binary tree:
 *                                  master = Level 0, RD2L/RD2R = Level 1, …, 32 leaves = Level 5
 * GET    /api/dev/seed/23b/export — streams seed-users.xlsx
 *
 * Security: SUPER_ADMIN only (enforced by parent devRouter).
 */

import { Router } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../config/prisma";
import { registerUser } from "../auth/auth.service";
import { createManualAdminDeposit } from "../admin/admin-deposits.service";
import { createInvestment } from "../investments/investments.service";
import { sendSuccess } from "../shared/response";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { logger } from "../lib/logger";
import { runSeed23B } from "./seed23b.fn";

const seedRouter = Router();

// ── Constants ──────────────────────────────────────────────────────────────────

const SEED_PASSWORD  = "RDprimewave@321!";
const SEED_PLAN      = "PLAN_360" as const;
const SEED_AMOUNT    = 100;
const SEED_NETWORK   = "BEP20" as const;
const COMPANY_WALLET = "0xSEED23BTestCompanyWallet";
const MASTER_USERNAME = "master";

// ── Tree helpers ───────────────────────────────────────────────────────────────

interface TreeNode {
  index:       number;
  username:    string;          // "RD2" (virtual/master prefix) | "RD2L" | "RD2LL" …
  parentIndex: number | null;
  position:    "LEFT" | "RIGHT" | null;
  level:       number;          // 0 = master, 1-5 = seed users
  leg:         "L" | "R" | null;
  isNew:       boolean;         // false = master placeholder; true = register new user
}

/**
 * 63-node BFS tree.
 *   Node 0  = virtual master placeholder (username prefix "RD2"; NOT created — master already exists).
 *   Nodes 1-62 = new accounts to register.
 *
 * Username derivation: child = parent.username + ("L" | "R")
 *   → RD2L, RD2R, RD2LL, RD2LR, RD2RL, RD2RR, …
 *
 * Level formula: floor(log2(i + 1))
 *   i=0 → 0 (master), i=1,2 → 1, i=3..6 → 2, …, i=31..62 → 5
 */
function buildTree(): TreeNode[] {
  const nodes: TreeNode[] = [];

  for (let i = 0; i < 63; i++) {
    const level       = Math.floor(Math.log2(i + 1));
    const parentIndex = i === 0 ? null : Math.floor((i - 1) / 2);
    const position    = i === 0
      ? null
      : (i % 2 === 1 ? "LEFT" : "RIGHT") as "LEFT" | "RIGHT";
    const leg         = position === null ? null : (position === "LEFT" ? "L" : "R");

    const username = i === 0
      ? "RD2"
      : nodes[parentIndex!].username + (position === "LEFT" ? "L" : "R");

    nodes.push({ index: i, username, parentIndex, position, level, leg, isNew: i > 0 });
  }

  return nodes;
}

/** Deterministic Indian mobile number (+91 + 10 digits, no repeats for i = 0..999). */
function indianPhone(i: number): string {
  const firstDigit = 6 + (i % 4);
  const body       = String(100_000_000 + i * 1_579).slice(1);
  return `+91${firstDigit}${body}`;
}

/** Unique deterministic-ish fake txHash per slot. */
function fakeTxHash(slot: number): string {
  const rand = Math.floor(Math.random() * 0xffff_ffff).toString(16).padStart(8, "0");
  return `0x23bseed${slot.toString(16).padStart(4, "0")}${rand}`;
}

/** Look up SUPER_ADMIN id (needed for deposit approval). */
async function getAdminId(): Promise<string> {
  const admin = await prisma.admin.findFirst({
    where:  { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) throw new AppError("No SUPER_ADMIN found", HTTP_STATUS.INTERNAL_SERVER_ERROR, "NO_ADMIN");
  return admin.id;
}

// ── Seed row shape ─────────────────────────────────────────────────────────────

interface SeedRow {
  index:               number;
  level:               number;
  username:            string;
  email:               string;
  password:            string;
  phone:               string;
  country:             string;
  userId:              string;
  referralCode:        string;
  sponsorUsername:     string;
  binaryParentUsername:string;
  placement:           string;
  walletId:            string;
  depositId:           string;
  investmentId:        string;
  planType:            string;
  status:              string;
}

// ── DELETE /api/dev/seed/23b ────────────────────────────────────────────────────

seedRouter.delete("/23b", async (_req, res, next) => {
  try {
    logger.info("Seed 23B DELETE: starting — wipe rd2* users and reset master");

    const master = await prisma.user.findFirst({
      where:  { username: MASTER_USERNAME },
      select: { id: true },
    });
    if (!master) throw new AppError("Master user not found", HTTP_STATUS.NOT_FOUND, "NO_MASTER");

    const seedUsers = await prisma.user.findMany({
      where:  { username: { startsWith: "rd2" } },
      select: { id: true },
    });
    const seedIds = seedUsers.map(u => u.id);
    logger.info({ count: seedIds.length }, "Seed 23B DELETE: seed users found");

    if (seedIds.length > 0) {
      // 1. IncomeTransferRelease → IncomeTransfer
      const transfers = await prisma.incomeTransfer.findMany({
        where:  { userId: { in: seedIds } },
        select: { id: true },
      });
      if (transfers.length > 0) {
        await prisma.incomeTransferRelease.deleteMany({
          where: { transferId: { in: transfers.map(t => t.id) } },
        });
      }
      await prisma.incomeTransfer.deleteMany({ where: { userId: { in: seedIds } } });

      // 2. Salary
      await prisma.salaryIncome.deleteMany({ where: { userId: { in: seedIds } } });
      await prisma.salaryAchievement.deleteMany({ where: { userId: { in: seedIds } } });

      // 3. Binary income
      await prisma.binaryOrbitIncome.deleteMany({ where: { userId: { in: seedIds } } });
      await prisma.binaryMatchIncome.deleteMany({ where: { userId: { in: seedIds } } });

      // 4. BV ledgers (seed user as ancestor OR as investor)
      const bvOr = [{ userId: { in: seedIds } }, { investorId: { in: seedIds } }];
      await prisma.bvHistory.deleteMany({ where: { OR: bvOr } });
      await prisma.matchBvLedger.deleteMany({ where: { OR: bvOr } });
      await prisma.orbitBvLedger.deleteMany({ where: { OR: bvOr } });
      await prisma.salaryBvLedger.deleteMany({ where: { OR: bvOr } });

      // 5. Level income (seed user as receiver OR as source)
      await prisma.levelIncome.deleteMany({
        where: { OR: [{ receiverUserId: { in: seedIds } }, { sourceUserId: { in: seedIds } }] },
      });

      // 6. ROI ledger
      await prisma.roiLedger.deleteMany({ where: { userId: { in: seedIds } } });

      // 7. Wallet transactions for seed users
      await prisma.walletTransaction.deleteMany({ where: { userId: { in: seedIds } } });

      // 8. Investments / Deposits / Withdrawals
      await prisma.investment.deleteMany({ where: { userId: { in: seedIds } } });
      await prisma.depositRequest.deleteMany({ where: { userId: { in: seedIds } } });
      await prisma.withdrawalRequest.deleteMany({ where: { userId: { in: seedIds } } });

      // 9. Referral history (seed user as child OR as sponsor)
      await prisma.referralHistory.deleteMany({
        where: { OR: [{ userId: { in: seedIds } }, { sponsorId: { in: seedIds } }] },
      });

      // 10. Delete seed users (Wallet cascades via Cascade FK)
      await prisma.user.deleteMany({ where: { id: { in: seedIds } } });

      logger.info({ count: seedIds.length }, "Seed 23B DELETE: seed users removed");
    }

    // 11. Purge master's wallet transactions (all were generated by seed level income / deposits)
    await prisma.walletTransaction.deleteMany({ where: { userId: master.id } });

    // 12. Purge master's deposits and investments created by seed
    await prisma.roiLedger.deleteMany({ where: { userId: master.id } });
    await prisma.investment.deleteMany({ where: { userId: master.id } });
    await prisma.depositRequest.deleteMany({ where: { userId: master.id } });

    // 13. Reset master binary-tree cache and wallet balances
    await prisma.user.update({
      where: { id: master.id },
      data: {
        leftBV:              0,
        rightBV:             0,
        leftDeepestNodeId:   null,
        rightDeepestNodeId:  null,
        directLeftCount:     0,
        directRightCount:    0,
        directReferralCount: 0,
      },
    });

    await prisma.wallet.update({
      where: { userId: master.id },
      data: {
        depositWallet:          0,
        incomeWallet:           0,
        withdrawalWallet:       0,
        lockedWithdrawalBalance:0,
      },
    });

    // 14. Purge master level income records (received from seed users)
    await prisma.levelIncome.deleteMany({ where: { receiverUserId: master.id } });

    // 15. Purge master BV entries (as ancestor whose legs received BV from seed investments)
    await prisma.bvHistory.deleteMany({ where: { userId: master.id } });
    await prisma.matchBvLedger.deleteMany({ where: { userId: master.id } });
    await prisma.orbitBvLedger.deleteMany({ where: { userId: master.id } });
    await prisma.salaryBvLedger.deleteMany({ where: { userId: master.id } });

    logger.info("Seed 23B DELETE: master reset complete");

    sendSuccess(res, {
      message: "Sprint 23B seed deleted — system restored to clean pre-seed state",
      deleted: { seedUsersDeleted: seedIds.length, masterReset: true },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/seed/23b ─────────────────────────────────────────────────────

seedRouter.post("/23b", async (_req, res, next) => {
  try {
    const summary = await runSeed23B();

    sendSuccess(res, {
      message:
        "Sprint 23B seed complete — perfect binary tree. " +
        "Master = Level 0 → RD2L (LEFT) + RD2R (RIGHT) at Level 1.",
      summary: {
        ...summary,
        exportUrl: "/api/dev/seed/23b/export",
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dev/seed/23b/export ───────────────────────────────────────────────

seedRouter.get("/23b/export", async (_req, res, next) => {
  try {
    const [masterUser, seedUsers] = await Promise.all([
      prisma.user.findFirst({
        where:  { username: MASTER_USERNAME },
        select: {
          id: true, username: true, email: true, phone: true,
          referralCode: true, status: true, position: true,
          wallet: {
            select: { id: true, depositWallet: true, incomeWallet: true, withdrawalWallet: true },
          },
          investments: {
            where: { status: { in: ["ACTIVE", "MATURED"] } },
            orderBy: { createdAt: "desc" }, take: 1,
            select: { id: true, planType: true, amount: true, status: true, startedAt: true, maturesAt: true },
          },
          depositRequests: {
            where: { status: "APPROVED" },
            orderBy: { createdAt: "desc" }, take: 1,
            select: { id: true, amount: true, status: true, approvedAt: true },
          },
        },
      }),
      prisma.user.findMany({
        where:   { username: { startsWith: "rd2" } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, username: true, email: true, phone: true,
          referralCode: true, status: true, position: true,
          wallet: {
            select: { id: true, depositWallet: true, incomeWallet: true, withdrawalWallet: true },
          },
          investments: {
            where: { status: { in: ["ACTIVE", "MATURED"] } },
            orderBy: { createdAt: "desc" }, take: 1,
            select: { id: true, planType: true, amount: true, status: true, startedAt: true, maturesAt: true },
          },
          depositRequests: {
            where: { status: "APPROVED" },
            orderBy: { createdAt: "desc" }, take: 1,
            select: { id: true, amount: true, status: true, approvedAt: true },
          },
          sponsor:      { select: { username: true } },
          binaryParent: { select: { username: true } },
        },
      }),
    ]);

    if (!masterUser && seedUsers.length === 0) {
      throw new AppError(
        "No seed data found. Run POST /api/dev/seed/23b first.",
        HTTP_STATUS.NOT_FOUND,
        "NOT_SEEDED",
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildRow = (u: any, level: number, sponsorName: string, binaryParentName: string) => {
      const inv = u.investments?.[0];
      const dep = u.depositRequests?.[0];
      return {
        "Username":               (u.username as string).toUpperCase(),
        "Email":                  u.email,
        "Password":               u.username === MASTER_USERNAME ? "Master@PrimeWave2025!" : SEED_PASSWORD,
        "Phone":                  u.phone ?? "",
        "Country":                "India",
        "User ID":                u.id,
        "Sponsor":                sponsorName,
        "Binary Parent":          binaryParentName,
        "Placement":              u.position ?? "ROOT",
        "Tree Level":             level,
        "Investment Status":      level === 5 ? "INACTIVE" : "ACTIVE",
        "Investment Plan":        inv?.planType ?? "",
        "Investment Amount":      inv ? `$${Number(inv.amount).toFixed(2)}` : "",
        "Investment ID":          inv?.id ?? "",
        "Investment Start":       inv?.startedAt?.toISOString().slice(0, 10) ?? "",
        "Matures At":             inv?.maturesAt?.toISOString().slice(0, 10) ?? "",
        "Deposit Amount":         dep ? `$${Number(dep.amount).toFixed(2)}` : "",
        "Deposit Status":         dep?.status ?? "",
        "Deposit Approved At":    dep?.approvedAt?.toISOString().slice(0, 10) ?? "",
        "Deposit ID":             dep?.id ?? "",
        "Wallet ID":              u.wallet?.id ?? "",
        "Deposit Wallet ($)":     Number(u.wallet?.depositWallet ?? 0).toFixed(2),
        "Income Wallet ($)":      Number(u.wallet?.incomeWallet ?? 0).toFixed(2),
        "Withdrawal Wallet ($)":  Number(u.wallet?.withdrawalWallet ?? 0).toFixed(2),
      };
    };

    const sheetData: ReturnType<typeof buildRow>[] = [];

    // Row 0 — master (Level 0)
    if (masterUser) {
      sheetData.push(buildRow(masterUser, 0, "—", "—"));
    }

    // Rows 1-62 — rd2* seed users
    for (const u of seedUsers) {
      // Level derived from username length: "rd2l"→4-3=1, "rd2ll"→5-3=2, …
      const level           = (u.username as string).length - 3;
      const sponsorName     = u.sponsor?.username
        ? (u.sponsor.username === MASTER_USERNAME ? "MASTER" : (u.sponsor.username as string).toUpperCase())
        : "MASTER";
      const binaryParentName = u.binaryParent?.username
        ? (u.binaryParent.username === MASTER_USERNAME ? "MASTER" : (u.binaryParent.username as string).toUpperCase())
        : sponsorName;
      sheetData.push(buildRow(u, level, sponsorName, binaryParentName));
    }

    if (sheetData.length === 0) {
      throw new AppError("No rows to export.", HTTP_STATUS.NOT_FOUND, "NO_ROWS");
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws["!cols"] = Object.keys(sheetData[0]).map(k => ({ wch: Math.max(k.length + 2, 20) }));
    XLSX.utils.book_append_sheet(wb, ws, "Seed Users 23B");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    res.setHeader("Content-Disposition", 'attachment; filename="seed-users.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// ── 127-node tree builder (Levels 0-6) ────────────────────────────────────────

function buildTree127(): TreeNode[] {
  const nodes: TreeNode[] = [];

  for (let i = 0; i < 127; i++) {
    const level       = Math.floor(Math.log2(i + 1));
    const parentIndex = i === 0 ? null : Math.floor((i - 1) / 2);
    const position    = i === 0
      ? null
      : (i % 2 === 1 ? "LEFT" : "RIGHT") as "LEFT" | "RIGHT";
    const leg         = position === null ? null : (position === "LEFT" ? "L" : "R");

    const username = i === 0
      ? "RD2"
      : nodes[parentIndex!].username + (position === "LEFT" ? "L" : "R");

    nodes.push({ index: i, username, parentIndex, position, level, leg, isNew: i > 62 });
  }

  return nodes;
}

/** 23D fake txHash — "23d" prefix guarantees no collision with 23B hashes. */
function fakeTxHash23d(slot: number): string {
  const rand = Math.floor(Math.random() * 0xffff_ffff).toString(16).padStart(8, "0");
  return `0x23dseed${slot.toString(16).padStart(4, "0")}${rand}`;
}

// ── POST /api/dev/seed/23d ─────────────────────────────────────────────────────
//
// Appends Level 6 (64 new accounts) to the existing 63-account tree.
// Prerequisite: POST /api/dev/seed/23b must have been run.
//
// Steps per new user:
//   1. Register via registerUser (sponsor = Level-5 parent, correct leg).
//   2. Set status → INACTIVE (leaf node, no children).
//   3. Create $100 deposit → approve.
//   4. Create $100 PLAN_360 investment (autoCompound=OFF).
//
// After all 64 users are created, Level-5 nodes are promoted to ACTIVE because
// they now have both left and right direct referrals.

seedRouter.post("/23d", async (_req, res, next) => {
  try {
    logger.info("Seed 23D POST: starting — append 64 Level-6 accounts to existing 63-account tree");

    const nodes   = buildTree127();
    const adminId = await getAdminId();

    // Verify master exists
    const masterUser = await prisma.user.findFirst({
      where:  { username: MASTER_USERNAME },
      select: { id: true, referralCode: true },
    });
    if (!masterUser) throw new AppError("Master user not found", HTTP_STATUS.NOT_FOUND, "NO_MASTER");

    // Batch-load all existing rd2* users (Levels 1-5) in one query
    const existingRd2 = await prisma.user.findMany({
      where:  { username: { startsWith: "rd2" } },
      select: { id: true, username: true, referralCode: true },
    });
    const byUsername = new Map(existingRd2.map(u => [u.username, u]));

    // Build referral-code index for nodes 0-62
    const codeByIndex: Record<number, string> = { 0: masterUser.referralCode };
    for (let i = 1; i < 63; i++) {
      const usernameLC = nodes[i].username.toLowerCase();
      const found      = byUsername.get(usernameLC);
      if (!found) {
        throw new AppError(
          `Level 0-5 user "${usernameLC}" not found — run POST /api/dev/seed/23b first.`,
          HTTP_STATUS.BAD_REQUEST,
          "MISSING_PREREQUISITES",
        );
      }
      codeByIndex[i] = found.referralCode;
    }

    const rows: SeedRow[] = [];

    // ── Phase 1: register Level-6 users, deposit, invest ─────────────────────
    for (let i = 63; i < 127; i++) {
      const node        = nodes[i];
      const usernameLC  = node.username.toLowerCase();
      const email       = `${usernameLC}@primewave.live`;
      const phone       = indianPhone(i);
      const sponsorCode = codeByIndex[node.parentIndex!];

      let userId:      string;
      let referralCode: string;
      let walletId:    string;

      // ── Register (idempotent) ─────────────────────────────────────────────
      const existing = await prisma.user.findFirst({
        where:  { username: usernameLC },
        select: { id: true, referralCode: true, wallet: { select: { id: true } } },
      });

      if (existing) {
        userId       = existing.id;
        referralCode = existing.referralCode;
        walletId     = existing.wallet!.id;
        logger.info({ username: usernameLC }, "Seed 23D: user exists — skipping registration");
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

        userId       = user.id;
        referralCode = user.referralCode;

        const w = await prisma.wallet.findUnique({
          where:  { userId },
          select: { id: true },
        });
        walletId = w!.id;

        // Level 6 = leaf node — no direct referrals → INACTIVE
        await prisma.user.update({ where: { id: userId }, data: { status: "INACTIVE" } });

        logger.info({ username: usernameLC, userId }, "Seed 23D: user created, INACTIVE");
      }

      codeByIndex[i] = referralCode;

      // ── Deposit (idempotent) ──────────────────────────────────────────────
      const existingDep = await prisma.depositRequest.findFirst({
        where:   { userId, status: "APPROVED" },
        select:  { id: true },
        orderBy: { createdAt: "desc" },
      });
      let depositId: string;
      if (existingDep) {
        depositId = existingDep.id;
      } else {
        const manualDep = await createManualAdminDeposit(adminId, {
          userId, amount: SEED_AMOUNT,
          network: SEED_NETWORK, reason: "Seed Data — Initial Capital",
        });
        depositId = manualDep.depositId;
      }

      // ── Investment (idempotent) ───────────────────────────────────────────
      const existingInv = await prisma.investment.findFirst({
        where:   { userId, status: { in: ["ACTIVE", "MATURED"] } },
        select:  { id: true, planType: true },
        orderBy: { createdAt: "desc" },
      });
      let investmentId: string;
      let planType:     string;
      if (existingInv) {
        investmentId = existingInv.id;
        planType     = existingInv.planType;
      } else {
        const inv = await createInvestment(userId, {
          amount:       SEED_AMOUNT,
          planType:     SEED_PLAN,
          autoCompound: false,
        });
        investmentId = inv.id;
        planType     = inv.planType;
      }

      const sponsorUsername = nodes[node.parentIndex!].username;
      rows.push({
        index:                i,
        level:                6,
        username:             node.username,
        email,
        password:             SEED_PASSWORD,
        phone,
        country:              "India",
        userId,
        referralCode,
        sponsorUsername:      sponsorUsername === "RD2" ? "MASTER" : sponsorUsername,
        binaryParentUsername: sponsorUsername === "RD2" ? "MASTER" : sponsorUsername,
        placement:            node.position!,
        walletId,
        depositId,
        investmentId,
        planType,
        status:               "INACTIVE",
      });
    }

    // ── Phase 2: promote Level-5 nodes to ACTIVE ──────────────────────────────
    // Level-5 nodes now have both left and right children, so they are active members.
    const level5Usernames = nodes.slice(31, 63).map(n => n.username.toLowerCase());
    const { count: promotedCount } = await prisma.user.updateMany({
      where: { username: { in: level5Usernames }, status: "INACTIVE" },
      data:  { status: "ACTIVE" },
    });
    logger.info({ promotedCount }, "Seed 23D: Level-5 nodes promoted to ACTIVE");

    // ── Final counts ──────────────────────────────────────────────────────────
    const [activeCount, inactiveCount, totalCount] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "INACTIVE" } }),
      prisma.user.count(),
    ]);

    logger.info(
      { newAccounts: rows.length, totalCount, activeCount, inactiveCount },
      "Seed 23D POST: complete",
    );

    sendSuccess(res, {
      message:
        "Sprint 23D seed complete — perfect binary tree through Level 6. " +
        "64 Level-6 leaf nodes added. Level-5 nodes promoted to ACTIVE.",
      summary: {
        existingAccountsPreserved: 63,
        newAccountsCreated:        rows.length,
        totalAccounts:             totalCount,
        newDeposits:               rows.length,
        newInvestments:            rows.length,
        activeMembers:             activeCount,
        inactiveMembers:           inactiveCount,
        exportUrl:                 "/api/dev/seed/23d/export",
      },
      rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dev/seed/23d/export ───────────────────────────────────────────────
//
// Streams seed-users-127.xlsx — all 127 accounts (master + Level 1-6).
// Columns match the Sprint 23D specification exactly.

seedRouter.get("/23d/export", async (_req, res, next) => {
  try {
    const [masterUser, allRd2Users] = await Promise.all([
      prisma.user.findFirst({
        where:  { username: MASTER_USERNAME },
        select: {
          id: true, username: true, email: true, phone: true,
          referralCode: true, status: true, position: true,
          wallet:          { select: { id: true } },
          investments: {
            where:   { status: { in: ["ACTIVE", "MATURED"] } },
            orderBy: { createdAt: "desc" }, take: 1,
            select:  { id: true, planType: true, amount: true, status: true, autoCompound: true },
          },
          depositRequests: {
            where:   { status: "APPROVED" },
            orderBy: { createdAt: "desc" }, take: 1,
            select:  { id: true, amount: true, status: true },
          },
        },
      }),
      prisma.user.findMany({
        where:   { username: { startsWith: "rd2" } },
        orderBy: { username: "asc" },
        select: {
          id: true, username: true, email: true, phone: true,
          referralCode: true, status: true, position: true,
          wallet:          { select: { id: true } },
          investments: {
            where:   { status: { in: ["ACTIVE", "MATURED"] } },
            orderBy: { createdAt: "desc" }, take: 1,
            select:  { id: true, planType: true, amount: true, status: true, autoCompound: true },
          },
          depositRequests: {
            where:   { status: "APPROVED" },
            orderBy: { createdAt: "desc" }, take: 1,
            select:  { id: true, amount: true, status: true },
          },
          sponsor:      { select: { username: true } },
          binaryParent: { select: { username: true } },
        },
      }),
    ]);

    if (!masterUser && allRd2Users.length === 0) {
      throw new AppError(
        "No seed data found. Run POST /api/dev/seed/23b then /api/dev/seed/23d first.",
        HTTP_STATUS.NOT_FOUND,
        "NOT_SEEDED",
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buildRow127 = (u: any, level: number, sponsorName: string, binaryParentName: string) => {
      const inv = u.investments?.[0];
      const dep = u.depositRequests?.[0];
      return {
        "Username":               (u.username as string).toUpperCase(),
        "Email":                  u.email,
        "Password":               u.username === MASTER_USERNAME ? "Master@PrimeWave2025!" : SEED_PASSWORD,
        "Phone":                  u.phone ?? "",
        "Country":                "India",
        "User ID":                u.id,
        "Sponsor Username":       sponsorName,
        "Binary Parent Username": binaryParentName,
        "Placement":              u.position ?? "ROOT",
        "Tree Level":             level,
        "Active / Inactive":      u.status,
        "Deposit Status":         dep?.status ?? "",
        "Investment Status":      inv?.status ?? "",
        "Investment Plan":        inv?.planType ?? "",
        "Auto Compound":          inv?.autoCompound === true ? "ON" : inv ? "OFF" : "",
      };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetData: ReturnType<typeof buildRow127>[] = [];

    if (masterUser) {
      sheetData.push(buildRow127(masterUser, 0, "—", "—"));
    }

    for (const u of allRd2Users) {
      // Level derived from username length: "rd2l" → 4-3=1, "rd2ll" → 5-3=2, …
      const level            = (u.username as string).length - 3;
      const sponsorName      = u.sponsor?.username
        ? (u.sponsor.username === MASTER_USERNAME
            ? "MASTER"
            : (u.sponsor.username as string).toUpperCase())
        : "MASTER";
      const binaryParentName = u.binaryParent?.username
        ? (u.binaryParent.username === MASTER_USERNAME
            ? "MASTER"
            : (u.binaryParent.username as string).toUpperCase())
        : sponsorName;
      sheetData.push(buildRow127(u, level, sponsorName, binaryParentName));
    }

    if (sheetData.length === 0) {
      throw new AppError("No rows to export.", HTTP_STATUS.NOT_FOUND, "NO_ROWS");
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws["!cols"] = Object.keys(sheetData[0]).map(k => ({ wch: Math.max(k.length + 2, 22) }));
    XLSX.utils.book_append_sheet(wb, ws, "Seed Users 127");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    res.setHeader("Content-Disposition", 'attachment; filename="seed-users-127.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

export default seedRouter;
