import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { writeLedgerEntry } from "../ledger/ledger.service";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { getSetting } from "../config/settings";
import type { LevelIncomeHistoryQuery } from "./level-income.schema";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of referral levels the engine pays. */
const ENGINE_LEVELS = 5;

/**
 * Default level config used as fallback when system_settings has no entry.
 * Official PrimeWave business rule: 1% flat across all 5 levels.
 */
const DEFAULT_LEVEL_CONFIG_JSON = JSON.stringify([
  { level: 1, rate: 1 },
  { level: 2, rate: 1 },
  { level: 3, rate: 1 },
  { level: 4, rate: 1 },
  { level: 5, rate: 1 },
]);

// ── Config loader ─────────────────────────────────────────────────────────────

/**
 * Load the level income rate table from system_settings.level.config.
 *
 * The result is cached by config/settings.ts for 5 minutes. Cache is
 * automatically invalidated whenever the admin saves a new level.config
 * via saveLevelConfig() (which calls clearSettingsCache).
 *
 * Validation rules (throws on failure — halts investment processing):
 *   ✓ JSON must be parseable.
 *   ✓ Levels 1–5 must all be present.
 *   ✓ Every rate must be a finite number.
 *   ✓ Every rate must be >= 0.
 */
export async function loadLevelRules(): Promise<Record<number, number>> {
  const raw = await getSetting("level.config", DEFAULT_LEVEL_CONFIG_JSON);

  let entries: { level: unknown; rate: unknown }[];
  try {
    entries = JSON.parse(raw) as { level: unknown; rate: unknown }[];
    if (!Array.isArray(entries)) throw new TypeError("expected array");
  } catch {
    throw new Error(
      "[Level Income] system_settings.level.config is not valid JSON. " +
      "Correct the row in system_settings and restart the server.",
    );
  }

  const byLevel: Record<number, number> = {};

  for (const e of entries) {
    if (typeof e.level !== "number" || !Number.isFinite(e.level)) {
      throw new Error(
        `[Level Income] level.config entry has non-numeric level field: ${JSON.stringify(e)}`,
      );
    }
    if (typeof e.rate !== "number" || !Number.isFinite(e.rate)) {
      throw new Error(
        `[Level Income] level.config entry for level ${e.level} has non-numeric rate: ${JSON.stringify(e)}`,
      );
    }
    if (e.rate < 0) {
      throw new Error(
        `[Level Income] level.config rate for level ${e.level} is negative (${e.rate}). Rates must be >= 0.`,
      );
    }
    // Only capture levels 1–ENGINE_LEVELS; ignore extras.
    if (e.level >= 1 && e.level <= ENGINE_LEVELS) {
      byLevel[e.level] = e.rate;
    }
  }

  // All levels 1–ENGINE_LEVELS must be present.
  for (let l = 1; l <= ENGINE_LEVELS; l++) {
    if (byLevel[l] === undefined) {
      throw new Error(
        `[Level Income] level.config is missing level ${l}. ` +
        `Config must define levels 1–${ENGINE_LEVELS}. ` +
        "Correct system_settings.level.config and restart the server.",
      );
    }
  }

  return byLevel;
}

// ── Level income propagation ──────────────────────────────────────────────────

/*
 * Level Income Business Rule — Sprint 28J (config source updated Sprint 31H)
 *
 * Pure referral commission. Binary qualification does NOT apply.
 *
 * Trigger:    A referred user makes a qualifying investment.
 * Recipients: First 5 levels of the sponsor (referral) chain.
 * Rate:       Read live from system_settings.level.config (cached 5 min).
 *
 * Every sponsor within the first five referral levels receives income
 * unconditionally — no investment requirement, no binary left/right
 * referral requirement, no rank or KYC check.
 */

export interface LevelIncomeTarget {
  receiverUserId: string;
  incomeAmount:   Prisma.Decimal;
  level:          number;
}

/**
 * Walk up the sponsor chain and pay level income to each ancestor.
 *
 * Called inside the createInvestment Prisma transaction — all payouts are
 * atomic with the investment creation.
 *
 * Rates are loaded from system_settings.level.config (auto-cached, auto-
 * invalidated on admin save — no restart required to pick up new rates).
 */
export async function processLevelIncome(
  tx: Prisma.TransactionClient,
  sourceUserId:     string,
  investmentId:     string,
  investmentAmount: Prisma.Decimal,
): Promise<LevelIncomeTarget[]> {
  // Load config outside the per-level loop (one cached read per investment).
  const levelRules = await loadLevelRules();

  const targets: LevelIncomeTarget[] = [];
  let currentUserId = sourceUserId;

  for (let level = 1; level <= ENGINE_LEVELS; level++) {
    const current = await tx.user.findUnique({
      where:  { id: currentUserId },
      select: { sponsorId: true },
    });

    const ancestorId = current?.sponsorId;
    if (!ancestorId) break;

    const pct          = levelRules[level]!;
    const percentage   = new Prisma.Decimal(pct);
    const incomeAmount = investmentAmount.times(percentage).div(100);

    const wallet = await tx.wallet.update({
      where:  { userId: ancestorId },
      data:   { withdrawalWallet: { increment: incomeAmount } },
      select: { id: true, withdrawalWallet: true },
    });

    await tx.levelIncome.create({
      data: {
        receiverUserId:  ancestorId,
        sourceUserId,
        level,
        investmentId,
        investmentAmount,
        percentage,
        incomeAmount,
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId:    wallet.id,
        userId:      ancestorId,
        type:        "LEVEL_INCOME",
        status:      "SUCCESS",
        amount:      incomeAmount,
        description: `Level ${level} income — ${pct}% of $${investmentAmount.toFixed(2)} investment by ${sourceUserId}`,
        metadata:    { level, sourceUserId, investmentId, percentage: pct, investmentAmount: investmentAmount.toFixed(8) },
      },
    });

    targets.push({ receiverUserId: ancestorId, incomeAmount, level });

    const _closingBalance = wallet.withdrawalWallet;
    void Promise.resolve().then(() => writeLedgerEntry({
      referenceId:     investmentId,
      referenceType:   "level_income",
      memberId:        ancestorId,
      username:        ancestorId,
      transactionType: "LEVEL_INCOME",
      amount:          incomeAmount,
      debitCredit:     "CREDIT",
      walletType:      "WITHDRAWAL_WALLET",
      closingBalance:  _closingBalance,
      investmentId,
      metadata:        { level, sourceUserId, percentage: pct, investmentAmount: investmentAmount.toFixed(8) },
    })).catch(err => logger.error({ err }, "ledger: level income write failed"));

    currentUserId = ancestorId;
  }

  return targets;
}

// ── History query ─────────────────────────────────────────────────────────────

const historySelect = {
  id:               true,
  level:            true,
  investmentAmount: true,
  percentage:       true,
  incomeAmount:     true,
  createdAt:        true,
  source: {
    select: {
      id:        true,
      username:  true,
      firstName: true,
      lastName:  true,
    },
  },
  investment: {
    select: {
      id:       true,
      amount:   true,
      planType: true,
    },
  },
} as const;

export async function getLevelIncomeHistory(
  receiverUserId: string,
  query: LevelIncomeHistoryQuery,
) {
  const exists = await prisma.user.findUnique({
    where: { id: receiverUserId },
    select: { id: true },
  });
  if (!exists) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const { page, limit, sourceUserId, level } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.LevelIncomeWhereInput = {
    receiverUserId,
    ...(sourceUserId && { sourceUserId }),
    ...(level        && { level }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.levelIncome.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  historySelect,
    }),
    prisma.levelIncome.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
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

// ── Summary query ─────────────────────────────────────────────────────────────

export async function getLevelIncomeSummary(receiverUserId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: receiverUserId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }

  const grouped = await prisma.levelIncome.groupBy({
    by:     ["level"],
    where:  { receiverUserId },
    _sum:   { incomeAmount: true },
    _count: { id: true },
    orderBy: { level: "asc" },
  });

  const totals = await prisma.levelIncome.aggregate({
    where: { receiverUserId },
    _sum:  { incomeAmount: true },
    _count: { id: true },
  });

  // Load live rates for display; fall back to 0 if config fails for any reason.
  let levelRules: Record<number, number> = {};
  try {
    levelRules = await loadLevelRules();
  } catch {
    // Non-fatal for summary display — rates show as 0 if config is broken.
  }

  const breakdown = grouped.map((g) => ({
    level:       g.level,
    count:       g._count.id,
    incomeAmount: g._sum.incomeAmount ?? new Prisma.Decimal(0),
    percentage:  levelRules[g.level] ?? 0,
  }));

  return {
    userId:       user.id,
    username:     user.username,
    totalIncome:  totals._sum.incomeAmount ?? new Prisma.Decimal(0),
    totalPayouts: totals._count.id,
    breakdown,
  };
}
