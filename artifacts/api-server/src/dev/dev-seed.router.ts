/**
 * Sprint 23B — Development Seed Dataset
 *
 * POST /api/dev/seed/23b      — idempotent: creates 63 users in a perfect binary tree
 *                               (levels 0-5, root=RD2), each with a $100 approved deposit
 *                               and a $100 PLAN_360 investment. Returns full JSON summary.
 *
 * GET  /api/dev/seed/23b/export — streams seed-users.xlsx for download
 *
 * Security: SUPER_ADMIN only (enforced by parent devRouter).
 */

import { Router } from "express";
import * as XLSX  from "xlsx";
import { prisma } from "../config/prisma";
import { registerUser } from "../auth/auth.service";
import { createDepositRequest } from "../deposits/deposits.service";
import { approveDeposit } from "../admin/admin-deposits.service";
import { createInvestment } from "../investments/investments.service";
import { sendSuccess } from "../shared/response";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { logger } from "../lib/logger";

const seedRouter = Router();

// ── Constants ──────────────────────────────────────────────────────────────────

const SEED_PASSWORD    = "RDprimewave@321!";
const SEED_PLAN        = "PLAN_360" as const;
const SEED_AMOUNT      = 100;
const SEED_NETWORK     = "BEP20" as const;
const COMPANY_WALLET   = "0xSEED23BTestCompanyWallet";
const MASTER_REF_CODE  = "MASTERROOT";

// ── Tree helpers ───────────────────────────────────────────────────────────────

interface TreeNode {
  index:       number;
  username:    string;          // "RD2", "RD2L", "RD2LL", …
  parentIndex: number | null;
  position:    "LEFT" | "RIGHT" | null;
  level:       number;
  leg:         "L" | "R";      // leg used at registration (root defaults "L")
}

/**
 * Build a BFS-ordered, 63-node perfect binary tree rooted at "RD2".
 *
 * Index i → left child at 2i+1, right child at 2i+2.
 * Left child always has an odd index; right child always has an even index > 0.
 */
function buildTree(): TreeNode[] {
  const nodes: TreeNode[] = [];

  for (let i = 0; i < 63; i++) {
    const level       = Math.floor(Math.log2(i + 1));
    const parentIndex = i === 0 ? null : Math.floor((i - 1) / 2);
    const position    = i === 0
      ? null
      : (i % 2 === 1 ? "LEFT" : "RIGHT") as "LEFT" | "RIGHT";
    const leg: "L" | "R" = position === "RIGHT" ? "R" : "L";  // root → "L"

    const username = i === 0
      ? "RD2"
      : nodes[parentIndex!].username + (position === "LEFT" ? "L" : "R");

    nodes.push({ index: i, username, parentIndex, position, level, leg });
  }

  return nodes;
}

/** Deterministic, valid Indian mobile number (+91 + 10 digits). */
function indianPhone(i: number): string {
  const firstDigit = 6 + (i % 4);              // 6, 7, 8, or 9
  const body       = String(100_000_000 + i * 1_579).slice(1); // 8 deterministic digits
  return `+91${firstDigit}${body}`;
}

/** Unique fake txHash — safe to call for any index. */
function fakeTxHash(i: number): string {
  const rand = Math.floor(Math.random() * 0xffff_ffff).toString(16).padStart(8, "0");
  return `0x23bseed${i.toString(16).padStart(4, "0")}${rand}`;
}

/** Return SUPER_ADMIN id — used for deposit approval. */
async function getAdminId(): Promise<string> {
  const admin = await prisma.admin.findFirst({
    where:  { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) {
    throw new AppError(
      "No SUPER_ADMIN found — seed one first",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "NO_ADMIN",
    );
  }
  return admin.id;
}

// ── Result row shape ───────────────────────────────────────────────────────────

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

// ── POST /api/dev/seed/23b ─────────────────────────────────────────────────────

seedRouter.post("/23b", async (_req, res, next) => {
  try {
    logger.info("Seed 23B: starting — 63 accounts, BFS order");

    const nodes   = buildTree();
    const adminId = await getAdminId();

    const idByIndex:   Record<number, string> = {};   // index → userId
    const codeByIndex: Record<number, string> = {};   // index → referralCode

    const rows: SeedRow[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node       = nodes[i];
      const usernameLC = node.username.toLowerCase();
      const email      = `${usernameLC}@primewave.live`;
      const phone      = indianPhone(i);

      // ── 1. Register (or load existing) user ───────────────────────────────

      let userId: string;
      let referralCode: string;
      let walletId: string;

      const existing = await prisma.user.findFirst({
        where:  { username: usernameLC },
        select: {
          id:           true,
          referralCode: true,
          wallet:       { select: { id: true } },
        },
      });

      if (existing) {
        userId       = existing.id;
        referralCode = existing.referralCode;
        walletId     = existing.wallet!.id;
        logger.info({ username: usernameLC }, "Seed 23B: user exists — skipping registration");
      } else {
        const sponsorCode = i === 0 ? MASTER_REF_CODE : codeByIndex[node.parentIndex!];

        const { user } = await registerUser({
          email,
          username:     node.username,
          password:     SEED_PASSWORD,
          firstName:    node.username,
          lastName:     "Seed",
          phone,
          referralCode: sponsorCode,
          leg:          node.leg,
        });

        userId       = user.id;
        referralCode = user.referralCode;

        const w = await prisma.wallet.findUnique({
          where:  { userId },
          select: { id: true },
        });
        walletId = w!.id;

        logger.info({ username: usernameLC, userId }, "Seed 23B: user created");
      }

      idByIndex[i]   = userId;
      codeByIndex[i] = referralCode;

      // ── 2. Deposit — create + approve if none exists ──────────────────────

      const approvedDep = await prisma.depositRequest.findFirst({
        where:  { userId, status: "APPROVED" },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });

      let depositId: string;

      if (approvedDep) {
        depositId = approvedDep.id;
        logger.info({ username: usernameLC }, "Seed 23B: approved deposit exists — skipping");
      } else {
        const dep = await createDepositRequest(userId, {
          amount:        SEED_AMOUNT,
          network:       SEED_NETWORK,
          txHash:        fakeTxHash(i),
          companyWallet: COMPANY_WALLET,
        });

        await approveDeposit(adminId, dep.id);
        depositId = dep.id;

        logger.info({ username: usernameLC, depositId }, "Seed 23B: deposit created & approved");
      }

      // ── 3. Investment — create if none exists ─────────────────────────────

      const existingInv = await prisma.investment.findFirst({
        where:   { userId, status: { in: ["ACTIVE", "MATURED"] } },
        select:  { id: true, planType: true },
        orderBy: { createdAt: "desc" },
      });

      let investmentId: string;
      let planType: string;

      if (existingInv) {
        investmentId = existingInv.id;
        planType     = existingInv.planType;
        logger.info({ username: usernameLC }, "Seed 23B: investment exists — skipping");
      } else {
        const inv = await createInvestment(userId, {
          amount:       SEED_AMOUNT,
          planType:     SEED_PLAN,
          autoCompound: false,
        });

        investmentId = inv.id;
        planType     = inv.planType;

        logger.info({ username: usernameLC, investmentId }, "Seed 23B: investment created");
      }

      // ── 4. Collect result row ─────────────────────────────────────────────

      const sponsorUsername = i === 0
        ? "master"
        : nodes[node.parentIndex!].username;

      const binaryParentUsername = sponsorUsername;

      // Level 5 = leaf nodes, no downline → INACTIVE per Prime Wave rules
      const status = node.level === 5 ? "INACTIVE" : "ACTIVE";

      rows.push({
        index:               i,
        level:               node.level,
        username:            node.username,
        email,
        password:            SEED_PASSWORD,
        phone,
        country:             "India",
        userId,
        referralCode,
        sponsorUsername,
        binaryParentUsername,
        placement:           node.position ?? "ROOT",
        walletId,
        depositId,
        investmentId,
        planType,
        status,
      });
    }

    const activeCount   = rows.filter(r => r.status === "ACTIVE").length;
    const inactiveCount = rows.filter(r => r.status === "INACTIVE").length;

    logger.info(
      { total: rows.length, activeCount, inactiveCount },
      "Seed 23B: complete",
    );

    sendSuccess(res, {
      message: "Sprint 23B seed complete — dataset ready for end-to-end testing",
      summary: {
        totalAccounts:      rows.length,
        totalDeposits:      rows.length,
        totalInvestments:   rows.length,
        totalDepositValue:  `$${rows.length * SEED_AMOUNT}`,
        totalInvestValue:   `$${rows.length * SEED_AMOUNT}`,
        activeMembers:      activeCount,
        inactiveMembers:    inactiveCount,
        exportUrl:          "/api/dev/seed/23b/export",
      },
      rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dev/seed/23b/export ───────────────────────────────────────────────

seedRouter.get("/23b/export", async (_req, res, next) => {
  try {
    // Fetch all RD2* users with their latest active investment and approved deposit
    const users = await prisma.user.findMany({
      where: { username: { startsWith: "rd2" } },
      orderBy: { createdAt: "asc" },
      select: {
        id:           true,
        username:     true,
        email:        true,
        phone:        true,
        referralCode: true,
        status:       true,
        sponsorId:    true,
        binaryParentId: true,
        position:     true,
        wallet: {
          select: { id: true, depositWallet: true, incomeWallet: true, withdrawalWallet: true },
        },
        investments: {
          where:   { status: { in: ["ACTIVE", "MATURED"] } },
          orderBy: { createdAt: "desc" },
          take:    1,
          select:  { id: true, planType: true, amount: true, status: true, startedAt: true, maturesAt: true },
        },
        depositRequests: {
          where:   { status: "APPROVED" },
          orderBy: { createdAt: "desc" },
          take:    1,
          select:  { id: true, amount: true, status: true, approvedAt: true },
        },
        sponsor: { select: { username: true } },
        binaryParent: { select: { username: true } },
      },
    });

    if (users.length === 0) {
      throw new AppError(
        "No seed users found. Run POST /api/dev/seed/23b first.",
        HTTP_STATUS.NOT_FOUND,
        "NOT_SEEDED",
      );
    }

    // Compute level from username length: "RD2" → 0, "RD2L" → 1, …
    const sheetData = users.map(u => {
      const inv  = u.investments[0];
      const dep  = u.depositRequests[0];
      const level = u.username.length - 3;  // "rd2" prefix = 3 chars

      return {
        "Username":              u.username.toUpperCase(),
        "Email":                 u.email,
        "Password":              SEED_PASSWORD,
        "Phone":                 u.phone ?? "",
        "Country":               "India",
        "User ID":               u.id,
        "Sponsor Username":      u.sponsor?.username?.toUpperCase() ?? "master",
        "Binary Parent Username": u.binaryParent?.username?.toUpperCase() ?? u.sponsor?.username?.toUpperCase() ?? "master",
        "Placement (Left/Right)": u.position ?? "ROOT",
        "Level":                 level,
        "Active / Inactive":     level >= 5 ? "INACTIVE" : "ACTIVE",
        "Investment ID":         inv?.id ?? "",
        "Investment Plan":       inv?.planType ?? "",
        "Investment Amount":     inv ? `$${Number(inv.amount).toFixed(2)}` : "",
        "Investment Status":     inv?.status ?? "",
        "Investment Start":      inv?.startedAt?.toISOString().slice(0, 10) ?? "",
        "Matures At":            inv?.maturesAt?.toISOString().slice(0, 10) ?? "",
        "Deposit ID":            dep?.id ?? "",
        "Deposit Amount":        dep ? `$${Number(dep.amount).toFixed(2)}` : "",
        "Deposit Status":        dep?.status ?? "",
        "Deposit Approved At":   dep?.approvedAt?.toISOString().slice(0, 10) ?? "",
        "Wallet ID":             u.wallet?.id ?? "",
        "Deposit Wallet":        `$${Number(u.wallet?.depositWallet ?? 0).toFixed(2)}`,
        "Income Wallet":         `$${Number(u.wallet?.incomeWallet ?? 0).toFixed(2)}`,
        "Withdrawal Wallet":     `$${Number(u.wallet?.withdrawalWallet ?? 0).toFixed(2)}`,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);

    // Auto column widths (rough estimate)
    ws["!cols"] = Object.keys(sheetData[0] ?? {}).map(k => ({
      wch: Math.max(k.length, 18),
    }));

    XLSX.utils.book_append_sheet(wb, ws, "Seed Users 23B");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="seed-users.xlsx"',
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

export default seedRouter;
