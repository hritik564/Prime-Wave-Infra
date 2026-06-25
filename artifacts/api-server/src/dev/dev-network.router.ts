import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { registerUser } from "../auth/auth.service";
import { placeUser } from "../binary/binary.service";
import { createInvestment } from "../investments/investments.service";
import { processMatchingCycle } from "../binary/matching.service";
import { processOrbitCycle } from "../binary/orbit.service";
import { runSalaryCycle } from "../salary";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { sendSuccess } from "../shared/response";
import { logger } from "../lib/logger";

const networkRouter = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_PASSWORD = "TestNetwork@2024!";

/** Amount in USD → BV generated (floor(amount/100)) */
const PRESET_AMOUNTS: Record<string, { amount: number; sides: ("LEFT" | "RIGHT")[] }> = {
  "50L":    { amount:  5_000, sides: ["LEFT"] },
  "50R":    { amount:  5_000, sides: ["RIGHT"] },
  "150L":   { amount: 15_000, sides: ["LEFT"] },
  "150R":   { amount: 15_000, sides: ["RIGHT"] },
  "500B":   { amount: 50_000, sides: ["LEFT", "RIGHT"] },
  "matchQ": { amount:  5_000, sides: ["LEFT", "RIGHT"] }, // 50 BV each → min(L,R) > 0
  "orbitQ": { amount: 15_000, sides: ["LEFT", "RIGHT"] }, // 150 BV each → orbit reward
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function creditWallet(userId: string, amount: number): Promise<void> {
  await prisma.wallet.update({
    where: { userId },
    data:  { depositWallet: { increment: new Prisma.Decimal(amount) } },
  });
}

/**
 * Returns the test users in owner's specified binary leg.
 * Returns: [direct, child1, child2] — deepest first is last.
 */
async function testUsersInLeg(
  ownerId:  string,
  position: "LEFT" | "RIGHT",
): Promise<{ id: string; username: string }[]> {
  const direct = await prisma.user.findFirst({
    where: { binaryParentId: ownerId, position, isTestUser: true },
    select: { id: true, username: true },
  });
  if (!direct) return [];

  const children = await prisma.user.findMany({
    where: { binaryParentId: direct.id, isTestUser: true },
    select: { id: true, username: true },
  });

  return [direct, ...children];
}

/** Find all test users created for a given owner (2 levels deep). */
async function findAllTestUsers(ownerId: string) {
  return prisma.user.findMany({
    where: {
      isTestUser: true,
      OR: [
        { sponsorId: ownerId },
        { sponsor: { sponsorId: ownerId } },
      ],
    },
    select: {
      id:           true,
      username:     true,
      position:     true,
      leftBV:       true,
      rightBV:      true,
      binaryParentId: true,
      sponsorId:    true,
    },
  });
}

// ── GET /status ───────────────────────────────────────────────────────────────

networkRouter.get("/status", async (req, res, next) => {
  try {
    const ownerId = String(req.query["ownerId"] ?? "");
    if (!ownerId) throw new AppError("ownerId required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    const owner = await prisma.user.findUnique({
      where:  { id: ownerId },
      select: {
        id: true, username: true,
        leftBV: true, rightBV: true,
        directReferralCount: true,
      },
    });
    if (!owner) throw new AppError("Owner not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

    const testUsers  = await findAllTestUsers(ownerId);
    const matchedBV  = Prisma.Decimal.min(owner.leftBV, owner.rightBV);
    const activeSalary = await prisma.salaryAchievement.findFirst({
      where:  { userId: ownerId, isActive: true },
      select: { rankName: true, monthlyAmount: true },
    });

    const recentMatching = await prisma.binaryMatchIncome.findFirst({
      where:   { userId: ownerId },
      orderBy: { createdAt: "desc" },
      select:  { incomeAmount: true, matchedBV: true, payableBV: true, createdAt: true },
    });
    const recentOrbit = await prisma.binaryOrbitIncome.findFirst({
      where:   { userId: ownerId },
      orderBy: { createdAt: "desc" },
      select:  { incomeAmount: true, matchedBV: true, rewardCount: true, createdAt: true },
    });

    sendSuccess(res, {
      owner: {
        id:                  owner.id,
        username:            owner.username,
        leftBV:              owner.leftBV.toFixed(2),
        rightBV:             owner.rightBV.toFixed(2),
        matchedBV:           matchedBV.toFixed(2),
        carryForwardBV:      Prisma.Decimal.max(owner.leftBV, owner.rightBV).minus(matchedBV).toFixed(2),
        powerLeg:            owner.leftBV.gte(owner.rightBV) ? "LEFT" : "RIGHT",
        weakLeg:             owner.leftBV.lt(owner.rightBV)  ? "LEFT" : "RIGHT",
        directReferralCount: owner.directReferralCount,
        directLeft:          owner.leftBV.toFixed(2),
        directRight:         owner.rightBV.toFixed(2),
      },
      qualification: {
        binaryQualified:   owner.directReferralCount >= 2,
        matchingQualified: owner.directReferralCount >= 2 && matchedBV.gt(0),
        orbitQualified:    owner.directReferralCount >= 2 && matchedBV.gte(150),
        salaryQualified:   activeSalary !== null,
        salaryRank:        activeSalary?.rankName ?? null,
        salarySalary:      activeSalary?.monthlyAmount.toFixed(2) ?? null,
      },
      testNetwork: {
        exists:    testUsers.length > 0,
        userCount: testUsers.length,
        users:     testUsers.map(u => ({
          id:             u.id,
          username:       u.username,
          position:       u.position,
          binaryParentId: u.binaryParentId,
          leftBV:         u.leftBV.toFixed(2),
          rightBV:        u.rightBV.toFixed(2),
        })),
      },
      lastResults: {
        matching: recentMatching
          ? {
              incomeAmount: recentMatching.incomeAmount.toFixed(2),
              matchedBV:    recentMatching.matchedBV.toFixed(2),
              payableBV:    recentMatching.payableBV.toFixed(2),
              at:           recentMatching.createdAt.toISOString(),
            }
          : null,
        orbit: recentOrbit
          ? {
              incomeAmount: recentOrbit.incomeAmount.toFixed(2),
              matchedBV:    recentOrbit.matchedBV.toFixed(2),
              rewardCount:  recentOrbit.rewardCount,
              at:           recentOrbit.createdAt.toISOString(),
            }
          : null,
      },
    });
  } catch (err) { next(err); }
});

// ── POST /generate ────────────────────────────────────────────────────────────

networkRouter.post("/generate", async (req, res, next) => {
  try {
    const { ownerId, planType, amount } = req.body as {
      ownerId:   string;
      planType?: string;
      amount?:   number;
    };
    if (!ownerId) throw new AppError("ownerId required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    const owner = await prisma.user.findUnique({
      where:  { id: ownerId },
      select: { id: true, username: true, referralCode: true },
    });
    if (!owner) throw new AppError("Owner not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

    // Guard: prevent duplicate networks
    const existing = await prisma.user.findFirst({
      where: { sponsorId: ownerId, isTestUser: true },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(
        "Test network already exists for this owner. Delete it first.",
        HTTP_STATUS.CONFLICT,
        "NETWORK_EXISTS",
      );
    }

    const suffix = Date.now().toString(36).toUpperCase();
    const created: { id: string; username: string; referralCode: string; role: string }[] = [];

    // ── Left Direct ──────────────────────────────────────────────────────────
    const { user: ld } = await registerUser({
      email:        `_tnet_ld_${suffix}@dev.test`,
      username:     `_tnetld_${suffix}`.toLowerCase().slice(0, 20),
      password:     TEST_PASSWORD,
      firstName:    "Left",
      lastName:     "Direct",
      referralCode: owner.referralCode,
    });
    await prisma.user.update({ where: { id: ld.id }, data: { isTestUser: true } });
    await placeUser(ownerId, { userId: ld.id, position: "LEFT" });
    created.push({ id: ld.id, username: ld.username, referralCode: ld.referralCode, role: "Left Direct" });

    // ── Right Direct ─────────────────────────────────────────────────────────
    const { user: rd } = await registerUser({
      email:        `_tnet_rd_${suffix}@dev.test`,
      username:     `_tnetrd_${suffix}`.toLowerCase().slice(0, 20),
      password:     TEST_PASSWORD,
      firstName:    "Right",
      lastName:     "Direct",
      referralCode: owner.referralCode,
    });
    await prisma.user.update({ where: { id: rd.id }, data: { isTestUser: true } });
    await placeUser(ownerId, { userId: rd.id, position: "RIGHT" });
    created.push({ id: rd.id, username: rd.username, referralCode: rd.referralCode, role: "Right Direct" });

    // ── Left Team Members (sponsored by Left Direct) ──────────────────────────
    for (const [i, pos] of (["LEFT", "RIGHT"] as const).entries()) {
      const { user: child } = await registerUser({
        email:        `_tnet_lc${i}_${suffix}@dev.test`,
        username:     `_tnetlc${i}_${suffix}`.toLowerCase().slice(0, 20),
        password:     TEST_PASSWORD,
        firstName:    `LChild${i + 1}`,
        lastName:     "Test",
        referralCode: ld.referralCode,
      });
      await prisma.user.update({ where: { id: child.id }, data: { isTestUser: true } });
      await placeUser(ld.id, { userId: child.id, position: pos });
      created.push({ id: child.id, username: child.username, referralCode: child.referralCode, role: `Left Child ${i + 1} (${pos})` });
    }

    // ── Right Team Members (sponsored by Right Direct) ────────────────────────
    for (const [i, pos] of (["LEFT", "RIGHT"] as const).entries()) {
      const { user: child } = await registerUser({
        email:        `_tnet_rc${i}_${suffix}@dev.test`,
        username:     `_tnetrc${i}_${suffix}`.toLowerCase().slice(0, 20),
        password:     TEST_PASSWORD,
        firstName:    `RChild${i + 1}`,
        lastName:     "Test",
        referralCode: rd.referralCode,
      });
      await prisma.user.update({ where: { id: child.id }, data: { isTestUser: true } });
      await placeUser(rd.id, { userId: child.id, position: pos });
      created.push({ id: child.id, username: child.username, referralCode: child.referralCode, role: `Right Child ${i + 1} (${pos})` });
    }

    // ── Optional: immediately invest for all test users ────────────────────────
    const investments: { userId: string; investmentId: string }[] = [];
    if (planType && amount && amount > 0) {
      for (const u of created) {
        await creditWallet(u.id, amount);
        const inv = await createInvestment(u.id, {
          amount,
          planType: planType as "PLAN_90" | "PLAN_180" | "PLAN_270" | "PLAN_360",
          autoCompound: false,
        });
        investments.push({ userId: u.id, investmentId: inv.id });
      }
    }

    logger.info(
      { ownerId, created: created.length, investments: investments.length },
      "Dev network: test network generated",
    );

    sendSuccess(res, {
      message:      "Test network generated",
      usersCreated: created.length,
      users:        created,
      investments:  investments.length > 0 ? `${investments.length} investments created ($${amount} each)` : "none",
    });
  } catch (err) { next(err); }
});

// ── POST /bv ──────────────────────────────────────────────────────────────────

networkRouter.post("/bv", async (req, res, next) => {
  try {
    const { ownerId, preset } = req.body as { ownerId: string; preset: string };
    if (!ownerId) throw new AppError("ownerId required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");
    if (!preset)  throw new AppError("preset required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    // ── Salary qualification ──────────────────────────────────────────────────
    if (preset === "salaryQ") {
      const rank = await prisma.salaryRankConfig.findFirst({
        where:   { isActive: true },
        orderBy: { requiredBusiness: "asc" },
        select:  { rankName: true, monthlySalary: true, durationMonths: true },
      });
      if (!rank) {
        throw new AppError(
          "No active salary rank configs found. Seed rank data first.",
          HTTP_STATUS.NOT_FOUND,
          "NO_RANK_CONFIG",
        );
      }

      const existing = await prisma.salaryAchievement.findUnique({
        where:  { userId_rankName: { userId: ownerId, rankName: rank.rankName } },
        select: { id: true, isActive: true },
      });

      const expiresAt = new Date(Date.now() + rank.durationMonths * 30 * 24 * 60 * 60 * 1_000);

      if (existing) {
        if (!existing.isActive) {
          await prisma.salaryAchievement.update({
            where: { id: existing.id },
            data:  { isActive: true, expiresAt },
          });
          sendSuccess(res, {
            message:       `${rank.rankName} salary achievement reactivated`,
            rankName:      rank.rankName,
            monthlyAmount: rank.monthlySalary.toFixed(2),
            expiresAt:     expiresAt.toISOString(),
          });
          return;
        }
        sendSuccess(res, {
          message:  `Already has active ${rank.rankName} salary achievement`,
          rankName: rank.rankName,
        });
        return;
      }

      await prisma.salaryAchievement.create({
        data: {
          userId:        ownerId,
          rankName:      rank.rankName,
          monthlyAmount: rank.monthlySalary,
          expiresAt,
          isActive:      true,
        },
      });

      logger.info({ ownerId, rankName: rank.rankName }, "Dev network: salary achievement created");
      sendSuccess(res, {
        message:       `${rank.rankName} salary achievement created`,
        rankName:      rank.rankName,
        monthlyAmount: rank.monthlySalary.toFixed(2),
        expiresAt:     expiresAt.toISOString(),
      });
      return;
    }

    // ── Level income qualification: invest from any downline test user ────────
    if (preset === "levelQ") {
      const testUser = await prisma.user.findFirst({
        where: {
          isTestUser: true,
          OR: [
            { binaryParentId: ownerId },
            { binaryParent: { binaryParentId: ownerId } },
          ],
        },
        select: { id: true, username: true },
      });
      if (!testUser) {
        throw new AppError(
          "No test users found under owner. Generate test network first.",
          HTTP_STATUS.NOT_FOUND,
          "NO_TEST_USERS",
        );
      }

      const amount = 1_000;
      await creditWallet(testUser.id, amount);
      const inv = await createInvestment(testUser.id, { amount, planType: "PLAN_90", autoCompound: false });
      sendSuccess(res, {
        message:     "Level income triggered via downline investment",
        investmentId: inv.id,
        from:         testUser.username,
        amount:       `$${amount}`,
        bvGenerated:  Math.floor(amount / 100),
      });
      return;
    }

    // ── Standard BV presets ───────────────────────────────────────────────────
    const config = PRESET_AMOUNTS[preset];
    if (!config) {
      throw new AppError(`Unknown preset "${preset}". Valid: 50L|50R|150L|150R|500B|matchQ|orbitQ|levelQ|salaryQ`, HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");
    }

    const results: {
      side: string; userId: string; username: string; investmentId: string; bvAdded: number;
    }[] = [];

    for (const side of config.sides) {
      const legUsers = await testUsersInLeg(ownerId, side);
      if (legUsers.length === 0) {
        throw new AppError(
          `No test users in ${side} leg. Generate test network first.`,
          HTTP_STATUS.NOT_FOUND,
          "NO_TEST_USERS",
        );
      }
      // Use the deepest user in the leg to maximise BV propagation path
      const target = legUsers[legUsers.length - 1];
      await creditWallet(target.id, config.amount);
      const inv = await createInvestment(target.id, {
        amount:      config.amount,
        planType:    "PLAN_90",
        autoCompound: false,
      });
      results.push({
        side,
        userId:      target.id,
        username:    target.username,
        investmentId: inv.id,
        bvAdded:     Math.floor(config.amount / 100),
      });
    }

    logger.info({ ownerId, preset, count: results.length }, "Dev network: BV generated");

    sendSuccess(res, {
      message:     "BV generated via production investment service",
      preset,
      investments: results,
    });
  } catch (err) { next(err); }
});

// ── POST /run ─────────────────────────────────────────────────────────────────

networkRouter.post("/run", async (req, res, next) => {
  try {
    const { engine } = req.body as { engine: string };
    if (!engine) throw new AppError("engine required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    const startTime  = Date.now();
    const cycleStart = new Date();

    let result: Record<string, unknown> = {};

    if (engine === "matching") {
      const cycleEnd = new Date();
      const r = await processMatchingCycle(cycleStart, cycleEnd);
      result = {
        engine:          "Binary Matching",
        usersProcessed:  r.processed,
        usersSkipped:    r.skipped,
        incomeGenerated: `$${r.totalIncome.toFixed(2)}`,
        matchedBV:       r.totalMatchedBV.toFixed(2),
        rewardedBV:      r.totalRewardedBV.toFixed(2),
        flushedBV:       r.totalFlushedBV.toFixed(2),
        carryFwdLeft:    r.totalCarryFwdLeft.toFixed(2),
        carryFwdRight:   r.totalCarryFwdRight.toFixed(2),
        walletUpdated:   r.processed,
      };
    } else if (engine === "orbit") {
      const cycleEnd = new Date();
      const r = await processOrbitCycle(cycleStart, cycleEnd);
      result = {
        engine:          "Binary Orbit",
        usersProcessed:  r.processed,
        usersSkipped:    r.skipped,
        incomeGenerated: `$${r.totalIncome.toFixed(2)}`,
        matchedBV:       r.totalMatchedBV.toFixed(2),
        flushedBV:       r.totalFlushedBV.toFixed(2),
        carryFwdLeft:    r.totalCarryFwdLeft.toFixed(2),
        carryFwdRight:   r.totalCarryFwdRight.toFixed(2),
        rewards:         r.totalRewards,
        walletUpdated:   r.processed,
      };
    } else if (engine === "salary") {
      const before = await prisma.salaryIncome.count();
      await runSalaryCycle(cycleStart);
      const after  = await prisma.salaryIncome.count();
      result = {
        engine:         "Salary",
        newPayouts:     after - before,
        walletUpdated:  after - before,
      };
    } else {
      throw new AppError("Unknown engine. Use: matching|orbit|salary", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");
    }

    const execMs = Date.now() - startTime;
    logger.info({ engine, execMs, ...result }, "Dev network: engine run complete");

    sendSuccess(res, { ...result, executionMs: execMs });
  } catch (err) { next(err); }
});

// ── DELETE / ──────────────────────────────────────────────────────────────────

networkRouter.delete("/", async (req, res, next) => {
  try {
    const { ownerId } = req.body as { ownerId?: string };
    if (!ownerId) throw new AppError("ownerId required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    // Collect all test users under this owner
    const testUsers = await findAllTestUsers(ownerId);
    if (testUsers.length === 0) {
      sendSuccess(res, { message: "No test network found", deleted: 0 });
      return;
    }

    const testIds   = testUsers.map(u => u.id);
    const usernames = testUsers.map(u => u.username);

    // ── BV REVERSAL ──────────────────────────────────────────────────────────
    // Read BV contributions from test investors before deleting records
    const bvEntries = await prisma.bvHistory.findMany({
      where:  { investorId: { in: testIds } },
      select: { userId: true, bv: true, side: true },
    });

    // Group by ancestor, sum left and right BV separately
    const ancestorDeltas = new Map<string, { left: Prisma.Decimal; right: Prisma.Decimal }>();
    for (const entry of bvEntries) {
      if (testIds.includes(entry.userId)) continue; // Skip test users (they'll be deleted)
      const prev = ancestorDeltas.get(entry.userId) ?? { left: new Prisma.Decimal(0), right: new Prisma.Decimal(0) };
      if (entry.side === "LEFT") {
        prev.left = prev.left.plus(entry.bv);
      } else {
        prev.right = prev.right.plus(entry.bv);
      }
      ancestorDeltas.set(entry.userId, prev);
    }

    // Decrement ancestors — clamp to 0 so engines that already consumed BV
    // don't push the value negative (GREATEST prevents double-subtract).
    for (const [ancestorId, delta] of ancestorDeltas.entries()) {
      await prisma.$executeRaw`
        UPDATE "users"
        SET
          "leftBV"  = GREATEST("leftBV"  - ${delta.left}::numeric,  0),
          "rightBV" = GREATEST("rightBV" - ${delta.right}::numeric, 0)
        WHERE id = ${ancestorId}
      `;
    }

    // ── Collect investment IDs before deletion ────────────────────────────────
    const testInvIds = (
      await prisma.investment.findMany({
        where:  { userId: { in: testIds } },
        select: { id: true },
      })
    ).map(i => i.id);

    // ── Compute sponsor count deltas for non-test sponsors ────────────────────
    const sponsorDeltas = new Map<string, number>();
    for (const u of testUsers) {
      if (u.sponsorId && !testIds.includes(u.sponsorId)) {
        sponsorDeltas.set(u.sponsorId, (sponsorDeltas.get(u.sponsorId) ?? 0) + 1);
      }
    }

    // ── Delete in correct order (Restrict FK constraints) ─────────────────────
    await prisma.$transaction(async (tx) => {
      // BV ledgers (ancestors and investors)
      await tx.bvHistory.deleteMany({
        where: { OR: [{ investorId: { in: testIds } }, { userId: { in: testIds } }] },
      });
      await tx.matchBvLedger.deleteMany({
        where: { OR: [{ investorId: { in: testIds } }, { userId: { in: testIds } }] },
      });
      await tx.orbitBvLedger.deleteMany({
        where: { OR: [{ investorId: { in: testIds } }, { userId: { in: testIds } }] },
      });
      await tx.salaryBvLedger.deleteMany({
        where: { OR: [{ investorId: { in: testIds } }, { userId: { in: testIds } }] },
      });

      // Level income (source or receiver)
      await tx.levelIncome.deleteMany({
        where: { OR: [{ sourceUserId: { in: testIds } }, { receiverUserId: { in: testIds } }] },
      });

      // ROI ledger (tied to investments)
      if (testInvIds.length > 0) {
        await tx.roiLedger.deleteMany({ where: { investmentId: { in: testInvIds } } });
      }

      // Wallet transactions
      await tx.walletTransaction.deleteMany({ where: { userId: { in: testIds } } });

      // Binary income records
      await tx.binaryMatchIncome.deleteMany({ where: { userId: { in: testIds } } });
      await tx.binaryOrbitIncome.deleteMany({ where: { userId: { in: testIds } } });

      // Salary records
      await tx.salaryIncome.deleteMany({ where: { userId: { in: testIds } } });
      await tx.salaryAchievement.deleteMany({ where: { userId: { in: testIds } } });

      // Investments
      await tx.investment.deleteMany({ where: { userId: { in: testIds } } });

      // Wallets
      await tx.wallet.deleteMany({ where: { userId: { in: testIds } } });

      // Referral history
      await tx.referralHistory.deleteMany({
        where: { OR: [{ userId: { in: testIds } }, { sponsorId: { in: testIds } }] },
      });

      // Notifications
      await tx.notification.deleteMany({ where: { userId: { in: testIds } } });

      // Decrement directReferralCount on real sponsors
      for (const [sponsorId, count] of sponsorDeltas.entries()) {
        await tx.user.update({
          where: { id: sponsorId },
          data:  { directReferralCount: { decrement: count } },
        });
      }

      // Clear deepest-node cache pointers that referenced test users
      await tx.user.updateMany({
        where: { leftDeepestNodeId: { in: testIds } },
        data:  { leftDeepestNodeId: null },
      });
      await tx.user.updateMany({
        where: { rightDeepestNodeId: { in: testIds } },
        data:  { rightDeepestNodeId: null },
      });

      // Delete the test users
      await tx.user.deleteMany({ where: { id: { in: testIds } } });
    });

    logger.info({ ownerId, deleted: testUsers.length }, "Dev network: test network deleted");

    sendSuccess(res, {
      message:      "Test network deleted",
      deleted:      testUsers.length,
      deletedUsers: usernames,
    });
  } catch (err) { next(err); }
});

export default networkRouter;
