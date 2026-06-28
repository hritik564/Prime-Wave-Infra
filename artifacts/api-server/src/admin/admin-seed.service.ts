import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── 127-Account Perfect Binary Tree Seed (Sprint 23D/23F) ────────────────────
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
//   • a zero-balance wallet
//   • one $100 PLAN_90 ACTIVE investment
//   • leftBV / rightBV / directLeftCount / directRightCount set correctly
//
// The endpoint is idempotent: if master already exists the seed is skipped.

export interface SeedResult {
  alreadySeeded: boolean;
  usersCreated:  number;
  message:       string;
}

const TREE_SIZE  = 127;
const MAX_LEVEL  = 6;

// BV available at each depth level (count of users in either sub-tree)
const BV_PER_LEVEL: Record<number, number> = {
  0: 63, 1: 31, 2: 15, 3: 7, 4: 3, 5: 1, 6: 0,
};

// Direct child count on each side (1 for levels 0-5, 0 for leaves)
const DIRECT_PER_LEVEL: Record<number, number> = {
  0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 0,
};

function getLevel(n: number): number {
  return Math.floor(Math.log2(n));
}

function getUsername(n: number): string {
  if (n === 1) return "master";
  // Build path from root to node (L/R choices)
  const path: string[] = [];
  let cur = n;
  while (cur > 1) {
    path.unshift(cur % 2 === 0 ? "l" : "r");
    cur = Math.floor(cur / 2);
  }
  const suffix = path.join("");
  if (suffix.length <= 3) return `rd2${suffix}`;   // levels 1-3
  return `n${n}`;                                   // levels 4+
}

function getMaturesAt(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function seedBinaryTree(): Promise<SeedResult> {
  // Build the full set of expected usernames to check what already exists
  const expectedUsernames = Array.from({ length: TREE_SIZE }, (_, i) => getUsername(i + 1));

  const existingUsers = await prisma.user.findMany({
    where:  { username: { in: expectedUsernames } },
    select: { id: true, username: true },
  });

  // Fully seeded when all 127 are present
  if (existingUsers.length >= TREE_SIZE) {
    logger.info({ count: existingUsers.length }, "Seed: already fully seeded");
    return { alreadySeeded: true, usersCreated: 0, message: `Already seeded — ${existingUsers.length} users found` };
  }

  // Pre-populate idMap with any users that already exist so parent links work
  const idMap: Record<number, string> = {};
  const existingNodeNums: number[] = [];
  for (const u of existingUsers) {
    const n = expectedUsernames.indexOf(u.username) + 1;
    if (n > 0) { idMap[n] = u.id; existingNodeNums.push(n); }
  }

  // Correct BV / direct counts on any pre-existing users
  // (they may have been created before the full tree was in place)
  for (const n of existingNodeNums) {
    const level       = getLevel(n);
    const bv          = BV_PER_LEVEL[level] ?? 0;
    const directCount = DIRECT_PER_LEVEL[level] ?? 0;
    await prisma.user.update({
      where: { id: idMap[n] },
      data:  {
        leftBV:              bv,
        rightBV:             bv,
        directLeftCount:     directCount,
        directRightCount:    directCount,
        directReferralCount: directCount * 2,
      },
    });
    logger.info({ n, username: expectedUsernames[n - 1], bv }, "Seed: corrected existing user BV");
  }

  logger.info(
    { existing: existingUsers.length, toCreate: TREE_SIZE - existingUsers.length },
    "Seed: generating 127-account binary tree…",
  );

  const passwordHash = await bcrypt.hash("Seed@123456!", 10);
  let created = 0;

  // ── Pass 1: Create all users (no nested relations to avoid Prisma XOR) ──────
  for (let n = 1; n <= TREE_SIZE; n++) {
    // Skip users that already exist
    if (idMap[n]) continue;
    const level        = getLevel(n);
    const username     = getUsername(n);
    const parentNum    = n === 1 ? null : Math.floor(n / 2);
    const parentId     = parentNum ? (idMap[parentNum] ?? null) : null;
    const position     = n === 1 ? null : (n % 2 === 0 ? "LEFT" : "RIGHT");
    const bv           = BV_PER_LEVEL[level] ?? 0;
    const directCount  = DIRECT_PER_LEVEL[level] ?? 0;
    const referralCode = `SEED${String(n).padStart(4, "0")}`;

    const userData: Prisma.UserUncheckedCreateInput = {
      email:               `${username}@seed.primewave.io`,
      username,
      firstName:           username,
      lastName:            "Seed",
      phone:               `+1${String(1_000_000_000 + n)}`,
      passwordHash,
      status:              "ACTIVE",
      referralCode,
      referredBy:          parentId ?? undefined,
      sponsorId:           parentId ?? undefined,
      binaryParentId:      parentId ?? undefined,
      position:            position as "LEFT" | "RIGHT" | null,
      leftBV:              bv,
      rightBV:             bv,
      directLeftCount:     directCount,
      directRightCount:    directCount,
      directReferralCount: directCount * 2,
      isTestUser:          true,
    };

    const user = await prisma.user.create({ data: userData, select: { id: true } });

    idMap[n] = user.id;
    created++;
    if (n % 20 === 0) logger.info({ n, username }, "Seed: users progress");
  }

  // ── Pass 2: Create wallets + investments in bulk ──────────────────────────
  const now       = new Date();
  const maturesAt = getMaturesAt(90);

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

  await prisma.investment.createMany({
    data: Object.values(idMap).map((userId) => ({
      userId,
      amount:           100,
      currentPrincipal: 100,
      planType:         "PLAN_90" as const,
      dailyROI:         "0.5000",
      durationDays:     90,
      autoCompound:     false,
      status:           "ACTIVE" as const,
      startedAt:        now,
      maturesAt,
    })),
    skipDuplicates: true,
  });

  logger.info({ created }, "Seed: binary tree complete");
  return {
    alreadySeeded: false,
    usersCreated:  created,
    message:       `Seeded ${created} users with wallets and investments`,
  };
}
