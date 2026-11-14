import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { createInvestment } from "../investments/investments.service";

// ── 127-Account Perfect Binary Tree Seed (Sprint 23D/23F, arch: Sprint 24) ────
//
// Produces a 7-level perfect binary tree:
//   Level 0 ( 1 node):  master
//   Level 1 ( 2 nodes): rd2l, rd2r
//   Level 2 ( 4 nodes): rd2ll … rd2rr
//   Level 3 ( 8 nodes): rd2lll … rd2rrr
//   Level 4 (16 nodes): n16 … n31
//   Level 5 (32 nodes): n32 … n63
//   Level 6 (64 nodes): n64 … n127
//
// Every user gets:
//   • status = ACTIVE
//   • a zero-balance wallet, seeded with $100 then invested canonically
//   • one $100 PLAN_360 ACTIVE investment via createInvestment()
//   • leftBV / rightBV populated by propagateBV (not manually set)
//   • directLeftCount / directRightCount set at user-creation time (tree structure)
//   • Level income, BV propagation, and salary evaluation all run per-investment
//
// Sprint 24: investments are created exclusively through the canonical
// createInvestment() service — no direct Prisma investment writes.
//
// Processing order: root → leaves (node 1 → 127) so that when rd2l's
// level-income runs, master already has an ACTIVE investment and satisfies
// the binary qualification gate (isBinaryQualified — pre-Sprint-28J level income rule).
//
// The endpoint is idempotent: if master already exists the seed is skipped.

export interface SeedResult {
  alreadySeeded:       boolean;
  usersCreated:        number;
  investmentsCreated:  number;
  message:             string;
}

const TREE_SIZE = 127;

// Direct child count on each side (1 for levels 0-5, 0 for leaves)
const DIRECT_PER_LEVEL: Record<number, number> = {
  0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0,
};

function getLevel(n: number): number {
  return Math.floor(Math.log2(n));
}

function getUsername(n: number): string {
  if (n === 1) return "master";
  const path: string[] = [];
  let cur = n;
  while (cur > 1) {
    path.unshift(cur % 2 === 0 ? "l" : "r");
    cur = Math.floor(cur / 2);
  }
  const suffix = path.join("");
  if (suffix.length <= 3) return `rd2${suffix}`;
  return `n${n}`;
}

export async function seedBinaryTree(): Promise<SeedResult> {
  const expectedUsernames = Array.from({ length: TREE_SIZE }, (_, i) => getUsername(i + 1));

  const existingUsers = await prisma.user.findMany({
    where:  { username: { in: expectedUsernames } },
    select: { id: true, username: true },
  });

  if (existingUsers.length >= TREE_SIZE) {
    logger.info({ count: existingUsers.length }, "Seed: already fully seeded");
    return {
      alreadySeeded:      true,
      usersCreated:       0,
      investmentsCreated: 0,
      message: `Already seeded — ${existingUsers.length} users found`,
    };
  }

  const idMap: Record<number, string> = {};
  for (const u of existingUsers) {
    const n = expectedUsernames.indexOf(u.username) + 1;
    if (n > 0) idMap[n] = u.id;
  }

  logger.info(
    { existing: existingUsers.length, toCreate: TREE_SIZE - existingUsers.length },
    "Seed: generating 127-account binary tree…",
  );

  const passwordHash = await bcrypt.hash("Seed@123456!", 10);
  let usersCreated = 0;

  // ── Pass 1: Create all users ──────────────────────────────────────────────
  // directLeftCount / directRightCount reflect the binary tree structure and
  // are set here at registration time (not updated by createInvestment).
  // leftBV / rightBV start at 0 — propagateBV increments them per investment.
  for (let n = 1; n <= TREE_SIZE; n++) {
    if (idMap[n]) continue;

    const level       = getLevel(n);
    const username    = getUsername(n);
    const parentNum   = n === 1 ? null : Math.floor(n / 2);
    const parentId    = parentNum ? (idMap[parentNum] ?? null) : null;
    const position    = n === 1 ? null : (n % 2 === 0 ? "LEFT" : "RIGHT");
    const directCount = DIRECT_PER_LEVEL[level] ?? 0;

    const userData: Prisma.UserUncheckedCreateInput = {
      email:               `${username}@seed.primewave.io`,
      username,
      firstName:           username,
      lastName:            "Seed",
      phone:               `+1${String(1_000_000_000 + n)}`,
      passwordHash,
      fullReplacementPasswordResetRunId: null,
      status:              "ACTIVE",
      referralCode:        `SEED${String(n).padStart(4, "0")}`,
      referredBy:          parentId ?? undefined,
      sponsorId:           parentId ?? undefined,
      binaryParentId:      parentId ?? undefined,
      position:            position as "LEFT" | "RIGHT" | null,
      leftBV:              0,
      rightBV:             0,
      directLeftCount:     directCount,
      directRightCount:    directCount,
      directReferralCount: directCount * 2,
      isTestUser:          true,
    };

    const user = await prisma.user.create({ data: userData, select: { id: true } });
    idMap[n] = user.id;
    usersCreated++;
    if (n % 20 === 0) logger.info({ n, username }, "Seed: users progress");
  }

  // ── Pass 2: Create wallets (zero-balance — investment funding happens next) ─
  await prisma.wallet.createMany({
    data: Object.values(idMap).map((userId) => ({
      userId,
      depositWallet:           0,
      incomeWallet:            0,
      withdrawalWallet:        0,
      lockedWithdrawalBalance: 0,
    })),
    skipDuplicates: true,
  });

  // ── Pass 3: Create investments via canonical service (root → leaves) ────────
  // For each node: credit $100 to depositWallet (platform seed deposit), then
  // call createInvestment() which validates balance, deducts, creates the
  // investment record, propagates BV, generates level income, and triggers
  // salary evaluation — identical to a live user investment.
  let investmentsCreated = 0;

  for (let n = 1; n <= TREE_SIZE; n++) {
    const userId = idMap[n];
    if (!userId) continue;

    const existingInv = await prisma.investment.count({ where: { userId } });
    if (existingInv > 0) {
      logger.debug({ n, userId }, "Seed: investment already exists, skipping");
      continue;
    }

    const wallet = await prisma.wallet.findUniqueOrThrow({
      where:  { userId },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.wallet.update({
        where: { userId },
        data:  { depositWallet: { increment: 100 } },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId:    wallet.id,
          userId,
          type:        "DEPOSIT",
          status:      "SUCCESS",
          amount:      100,
          description: "Seed deposit — $100 platform credit [seed-binary-tree]",
          metadata:    { seedDeposit: true, nodeNumber: n },
        },
      }),
    ]);

    await createInvestment(userId, { amount: 100, planType: "PLAN_360", autoCompound: false });

    investmentsCreated++;
    if (n % 20 === 0) logger.info({ n, investmentsCreated }, "Seed: investments progress");
  }

  logger.info({ usersCreated, investmentsCreated }, "Seed: binary tree complete");
  return {
    alreadySeeded:      false,
    usersCreated,
    investmentsCreated,
    message: `Seeded ${usersCreated} users and ${investmentsCreated} investments via canonical service`,
  };
}
