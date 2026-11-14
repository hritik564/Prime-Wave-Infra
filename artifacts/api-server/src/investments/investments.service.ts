import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { PLAN_CONFIG, createInvestmentSchema } from "./investments.schema";
import type { CreateInvestmentInput, ListInvestmentsQuery } from "./investments.schema";
import { propagateBV } from "../binary/bv.service";
import { processLevelIncome } from "../levelIncome";
import { notificationService } from "../notifications/notifications.service";
import { logger } from "../lib/logger";
import { processUserAchievements } from "../salary/salary-achievement.service";
import { writeLedgerEntry } from "../ledger/ledger.service";
import { propagateInvestmentBusiness } from "../salary/salary-business.service";
import { contributeSinglePlan, lockSinglePlanAccount, qualifySinglePlanTx } from "./single-plan.service";

// ── Create investment ─────────────────────────────────────────────────────────

export async function createInvestment(userId: string, input: { amount: number; planType: string; autoCompound?: boolean }) {
  const { amount, planType, autoCompound } = createInvestmentSchema.parse(input);
  const plan = PLAN_CONFIG[planType];
  const decimalAmount = new Prisma.Decimal(amount.toString());

  const { investment, levelIncomeTargets } = await prisma.$transaction(async (tx) => {
    await lockSinglePlanAccount(tx, userId);
    // Count ALL existing investments for this user (any status)
    const existingCount = await tx.investment.count({ where: { userId } });

    // Progressive minimum: (nth investment) × $100
    const minimumAmount = (existingCount + 1) * 100;
    if (amount < minimumAmount) {
      throw new AppError(
        `Minimum investment for your ${ordinal(existingCount + 1)} plan is $${minimumAmount}`,
        HTTP_STATUS.BAD_REQUEST,
        "BELOW_MINIMUM_INVESTMENT",
      );
    }

    // Read + lock deposit wallet
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true, depositWallet: true },
    });

    if (!wallet) {
      throw new AppError("Wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
    }

    if (wallet.depositWallet.lessThan(decimalAmount)) {
      throw new AppError(
        `Insufficient deposit wallet balance. Available: ${wallet.depositWallet.toFixed(8)}`,
        HTTP_STATUS.BAD_REQUEST,
        "INSUFFICIENT_BALANCE",
      );
    }

    // Deduct from deposit wallet
    const funded = await tx.wallet.updateMany({
      where: { userId, depositWallet: { gte: decimalAmount } },
      data: { depositWallet: { decrement: decimalAmount } },
    });
    if (funded.count !== 1) throw new AppError("Insufficient deposit balance", HTTP_STATUS.BAD_REQUEST, "INSUFFICIENT_BALANCE");

    // Calculate maturity date
    const startedAt = new Date();
    const maturesAt = null;

    // Create investment record
    const inv = await tx.investment.create({
      data: {
        userId,
        amount:           decimalAmount,
        currentPrincipal: decimalAmount,
        planType,
        dailyROI:    new Prisma.Decimal(plan.dailyROI),
        durationDays: plan.durationDays,
        autoCompound: autoCompound ?? false,
        startedAt,
        maturesAt,
      },
      select: investmentSelect,
    });
    await contributeSinglePlan(tx, userId, inv.id, decimalAmount);
    await qualifySinglePlanTx(tx, userId);

    // Wallet audit record
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId,
        type:        "INVESTMENT",
        status:      "SUCCESS",
        amount:      decimalAmount,
        description: `Investment created — ${planType} (${plan.dailyROI}%/day; no fixed maturity)`,
        metadata:    { investmentId: inv.id, planType, durationDays: plan.durationDays },
      },
    });

    // ── BV propagation — same transaction, atomic with investment creation ──
    await propagateBV(tx, userId, inv.id, decimalAmount);

    // ── Level income — walk sponsor chain, pay 5 levels at 1% each ──────────
    const levelTargets = await processLevelIncome(tx, userId, inv.id, decimalAmount);
    const sponsor = await tx.user.findUnique({ where: { id: userId }, select: { sponsorId: true } });
    if (sponsor?.sponsorId) await qualifySinglePlanTx(tx, sponsor.sponsorId);

    return { investment: inv, levelIncomeTargets: levelTargets };
  }, { timeout: 30_000 });

  void prisma.wallet.findUnique({ where: { userId }, select: { depositWallet: true } })
    .then(w => w && writeLedgerEntry({
      referenceId:     investment.id,
      referenceType:   "investment",
      memberId:        userId,
      username:        userId,
      transactionType: "INVESTMENT",
      amount:          decimalAmount,
      debitCredit:     "DEBIT",
      walletType:      "DEPOSIT_WALLET",
      closingBalance:  w.depositWallet,
      investmentId:    investment.id,
      metadata:        { planType, durationDays: plan.durationDays, autoCompound },
    }))
    .catch(err => logger.error({ err }, "ledger: investment write failed"));

  void notificationService.create({
    userId,
    type:    "INVESTMENT_CREATED",
    title:   "Investment Created",
    message: `Your investment of $${decimalAmount.toFixed(2)} is active at 0.8% daily ROI, subject to your member-level ROI cap.`,
    metadata: { investmentId: investment.id, planType, amount: decimalAmount.toString() },
  });

  for (const target of levelIncomeTargets) {
    void notificationService.create({
      userId:  target.receiverUserId,
      type:    "LEVEL_INCOME",
      title:   "Level Income Received",
      message: `You earned $${target.incomeAmount.toFixed(2)} level ${target.level} income from a downline investment.`,
      metadata: { level: target.level, incomeAmount: target.incomeAmount.toString(), sourceUserId: userId },
    });
  }

  // ── Salary business accounting (Sprint 33E) ──────────────────────────────
  // Walk the sponsor chain and credit DIRECT (depth 1) / DOWNLINE (depth 2+)
  // pools.  Runs after the investment tx commits; errors are logged and do not
  // roll back the investment.
  void (async () => {
    try {
      await propagateInvestmentBusiness(userId, investment.id, decimalAmount, "INVESTMENT_CREATED");
    } catch (err) {
      logger.error({ err, userId, investmentId: investment.id }, "salary-business: investment propagation failed");
    }
  })();

  // ── Event-driven salary qualification (Sprint 23E) ────────────────────────
  // After BV propagates, re-evaluate salary rank for the investor AND every
  // ancestor whose leg BV was updated by this investment.
  void (async () => {
    try {
      const affected = await prisma.salaryBvLedger.findMany({
        where:    { investmentId: investment.id },
        select:   { userId: true },
        distinct: ["userId"],
      });
      const userIds = [userId, ...affected.map((e) => e.userId)];
      for (const uid of userIds) {
        await processUserAchievements(uid);
      }
    } catch (err) {
      logger.error({ err, userId }, "Salary: event-driven evaluation failed after investment");
    }
  })();

  return investment;
}

// ── List investments ──────────────────────────────────────────────────────────

export async function listInvestments(userId: string, query: ListInvestmentsQuery) {
  const { page, limit, status } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.InvestmentWhereInput = {
    userId,
    ...(status !== undefined && { status }),
  };

  const [investments, total] = await prisma.$transaction([
    prisma.investment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: investmentSelect,
    }),
    prisma.investment.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const earned = await prisma.roiLedger.groupBy({
    by: ["investmentId"], where: { investmentId: { in: investments.map(i => i.id) } }, _sum: { amount: true },
  });
  const totals = new Map(earned.map(e => [e.investmentId, e._sum.amount?.toFixed(8) ?? "0"]));

  return {
    data: investments.map(i => ({ ...i, totalRoiEarned: totals.get(i.id) ?? "0" })),
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

// ── Get investment by id ──────────────────────────────────────────────────────

export async function getInvestmentById(userId: string, investmentId: string) {
  const investment = await prisma.investment.findUnique({
    where: { id: investmentId },
    select: investmentSelect,
  });

  if (!investment) {
    throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "INVESTMENT_NOT_FOUND");
  }

  // Users can only access their own investments
  if (investment.userId !== userId) {
    throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "INVESTMENT_NOT_FOUND");
  }

  return investment;
}

// ── Claim principal ───────────────────────────────────────────────────────────

export async function claimPrincipal(userId: string, investmentId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const investment = await tx.investment.findUnique({
      where: { id: investmentId },
      select: {
        id:                true,
        userId:            true,
        status:            true,
        claimablePrincipal: true,
        planType:          true,
      },
    });

    if (!investment || investment.userId !== userId) {
      throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "INVESTMENT_NOT_FOUND");
    }

    if (investment.planType === "SINGLE") {
      throw new AppError("Principal settlement is not enabled for this plan", HTTP_STATUS.BAD_REQUEST, "PRINCIPAL_SETTLEMENT_DISABLED");
    }

    if (investment.status !== "MATURED") {
      throw new AppError(
        "Principal can only be claimed from a matured investment",
        HTTP_STATUS.BAD_REQUEST,
        "INVESTMENT_NOT_MATURED",
      );
    }

    if (investment.claimablePrincipal.lessThanOrEqualTo(0)) {
      throw new AppError(
        "No claimable principal available",
        HTTP_STATUS.BAD_REQUEST,
        "NO_CLAIMABLE_PRINCIPAL",
      );
    }

    const principal = investment.claimablePrincipal;

    // Mark investment as COMPLETED
    const updatedInvestment = await tx.investment.update({
      where: { id: investmentId },
      data: {
        status:             "COMPLETED",
        completedAt:        new Date(),
        claimablePrincipal: new Prisma.Decimal(0),
      },
      select: investmentSelect,
    });

    // Credit income wallet
    const wallet = await tx.wallet.update({
      where: { userId },
      data: { incomeWallet: { increment: principal } },
      select: { id: true, incomeWallet: true },
    });

    // Audit record
    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId,
        type:        "PRINCIPAL_RELEASE",
        status:      "SUCCESS",
        amount:      principal,
        description: `Principal released — ${investment.planType}`,
        metadata:    { investmentId },
      },
    });

    return {
      investment: updatedInvestment,
      principalCredited: principal,
      incomeWalletBalance: wallet.incomeWallet,
    };
  });

  void notificationService.create({
    userId,
    type:    "PRINCIPAL_RELEASED",
    title:   "Principal Released",
    message: `Your principal of $${result.principalCredited.toFixed(2)} from your ${result.investment.planType} investment has been credited to your income wallet.`,
    metadata: { investmentId, principalCredited: result.principalCredited.toString() },
  });

  return result;
}

// ── Toggle auto-compound ──────────────────────────────────────────────────────

export async function updateAutoCompound(userId: string, investmentId: string, autoCompound: boolean) {
  return prisma.$transaction(async tx => {
  const initial = await tx.investment.findUnique({ where: { id: investmentId }, select: { userId: true, planType: true } });
  if (initial?.userId === userId && initial.planType === "SINGLE") await lockSinglePlanAccount(tx, userId);
  const investment = await tx.investment.findUnique({
    where: { id: investmentId },
    select: { id: true, userId: true, status: true },
  });

  if (!investment || investment.userId !== userId) {
    throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "INVESTMENT_NOT_FOUND");
  }

  if (investment.status === "COMPLETED") {
    throw new AppError(
      "Cannot modify a completed investment",
      HTTP_STATUS.BAD_REQUEST,
      "INVESTMENT_COMPLETED",
    );
  }

  return tx.investment.update({
    where: { id: investmentId },
    data: { autoCompound },
    select: investmentSelect,
  });
  });
}

// ── Shared select ─────────────────────────────────────────────────────────────

const investmentSelect = {
  id:                 true,
  userId:             true,
  amount:             true,
  currentPrincipal:   true,
  planType:           true,
  dailyROI:           true,
  durationDays:       true,
  autoCompound:       true,
  claimableROI:       true,
  claimablePrincipal: true,
  status:             true,
  startedAt:          true,
  maturesAt:          true,
  completedAt:        true,
  createdAt:          true,
  updatedAt:          true,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
