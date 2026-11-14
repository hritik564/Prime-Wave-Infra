import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Plan constants ─────────────────────────────────────────────────────────────

const PLAN_360 = {
  planType:    "PLAN_360" as const,
  durationDays: 360,
  dailyROI:    new Prisma.Decimal("0.8000"),
};

// ── Level income constants (mirrors level-income.service.ts) ──────────────────

const LEVEL_RULES: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
const MAX_LEVELS = 5;

// ── Main repair function ───────────────────────────────────────────────────────

export interface RepairReport {
  // ── Plan repair ─────────────────────────────────────────
  totalInvestmentsExamined: number;
  alreadyPlan360:           number;
  planRepaired:             number;

  // ── Level income repair ──────────────────────────────────
  investmentsWithLevelIncome:    number;
  investmentsMissingLevelIncome: number;
  levelIncomeRecordsCreated:     number;
  levelIncordsSkippedDuplicate:  number;
  totalLevelIncomeCredited:      string;

  // ── Integrity ────────────────────────────────────────────
  noSponsorSkipped:   number;   // investments where investor has no sponsor (master)
  inactiveAncestors:  number;   // ancestor levels skipped — ancestor not active member
  errors:             number;
}

/**
 * Sprint 23H — idempotent seed data repair.
 *
 * Repair 1 — Investment plan:
 *   Any investment still on PLAN_90 is updated to PLAN_360
 *   (durationDays=360, dailyROI=0.8000, maturesAt recalculated from startedAt).
 *   Investments already on PLAN_360 are untouched.
 *
 * Repair 2 — Level income:
 *   For every investment, walk the sponsor chain (up to MAX_LEVELS=5).
 *   For each ancestor level, check whether a LevelIncome record already exists
 *   for (investmentId, receiverUserId, level). If it exists → skip (idempotent).
 *   If it is missing → create the record, credit withdrawalWallet, and write the
 *   WalletTransaction audit entry.
 *   Uses the SAME business rules as processLevelIncome (1% per level, up to 5 levels,
 *   pure referral chain — no binary qualification gate, Sprint 28J).
 *
 * Safe to run multiple times. Creates no duplicates.
 */
export async function repairSeedInvestments(): Promise<RepairReport> {
  const report: RepairReport = {
    totalInvestmentsExamined:      0,
    alreadyPlan360:                0,
    planRepaired:                  0,
    investmentsWithLevelIncome:    0,
    investmentsMissingLevelIncome: 0,
    levelIncomeRecordsCreated:     0,
    levelIncordsSkippedDuplicate:  0,
    totalLevelIncomeCredited:      "0",
    noSponsorSkipped:              0,
    inactiveAncestors:             0,
    errors:                        0,
  };

  let totalCredited = new Prisma.Decimal(0);

  const investments = await prisma.investment.findMany({
    select: {
      id:          true,
      userId:      true,
      amount:      true,
      planType:    true,
      durationDays: true,
      dailyROI:    true,
      startedAt:   true,
    },
    orderBy: { startedAt: "asc" },
  });

  report.totalInvestmentsExamined = investments.length;
  logger.info({ count: investments.length }, "Repair: starting seed investment repair");

  for (const inv of investments) {
    try {
      // ── Repair 1: Plan fix ──────────────────────────────────────────────────
      if (inv.planType !== "PLAN_360" && inv.planType !== "SINGLE") {
        const maturesAt = new Date(inv.startedAt.getTime() + PLAN_360.durationDays * 86_400_000);
        await prisma.investment.update({
          where: { id: inv.id },
          data: {
            planType:    PLAN_360.planType,
            durationDays: PLAN_360.durationDays,
            dailyROI:    PLAN_360.dailyROI,
            maturesAt,
          },
        });
        report.planRepaired++;
        logger.info(
          { investmentId: inv.id, userId: inv.userId, oldPlan: inv.planType },
          "Repair: investment plan updated to PLAN_360",
        );
      } else {
        report.alreadyPlan360++;
      }

      // ── Repair 2: Level income ──────────────────────────────────────────────
      // Check whether this investment already has ANY level income records
      const existingCount = await prisma.levelIncome.count({
        where: { investmentId: inv.id },
      });

      // Walk sponsor chain regardless — we check per-level for completeness
      const investor = await prisma.user.findUnique({
        where:  { id: inv.userId },
        select: { sponsorId: true },
      });

      if (!investor?.sponsorId) {
        // Investor has no sponsor — no level income should exist (e.g. master)
        report.noSponsorSkipped++;
        if (existingCount > 0) {
          report.investmentsWithLevelIncome++;
        }
        continue;
      }

      if (existingCount > 0) {
        // Quick path: investment already has at least one record.
        // Still walk chain to catch any partially-missing levels.
        report.investmentsWithLevelIncome++;
      } else {
        report.investmentsMissingLevelIncome++;
      }

      // Walk up to MAX_LEVELS ancestors, creating any missing records
      let currentUserId = inv.userId;

      for (let level = 1; level <= MAX_LEVELS; level++) {
        const current = await prisma.user.findUnique({
          where:  { id: currentUserId },
          select: { sponsorId: true },
        });
        const ancestorId = current?.sponsorId;
        if (!ancestorId) break;

        // Duplicate guard: (investmentId, receiverUserId, level)
        const duplicate = await prisma.levelIncome.findFirst({
          where: {
            investmentId:   inv.id,
            receiverUserId: ancestorId,
            level,
          },
          select: { id: true },
        });

        if (duplicate) {
          report.levelIncordsSkippedDuplicate++;
          currentUserId = ancestorId;
          continue;
        }

        // Create record + credit wallet atomically
        const pct          = LEVEL_RULES[level]!;
        const percentage   = new Prisma.Decimal(pct);
        const incomeAmount = inv.amount.times(percentage).div(100);

        await prisma.$transaction(async (tx) => {
          const wallet = await tx.wallet.update({
            where:  { userId: ancestorId },
            data:   { withdrawalWallet: { increment: incomeAmount } },
            select: { id: true },
          });

          await tx.levelIncome.create({
            data: {
              receiverUserId:  ancestorId,
              sourceUserId:    inv.userId,
              level,
              investmentId:    inv.id,
              investmentAmount: inv.amount,
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
              description: `Level ${level} income — ${pct}% of $${inv.amount.toFixed(2)} investment by ${inv.userId} [seed repair]`,
              metadata: {
                level,
                sourceUserId:    inv.userId,
                investmentId:    inv.id,
                percentage:      pct,
                investmentAmount: inv.amount.toFixed(8),
                seedRepair:      true,
              },
            },
          });
        });

        report.levelIncomeRecordsCreated++;
        totalCredited = totalCredited.plus(incomeAmount);
        logger.info(
          { investmentId: inv.id, ancestorId, level, incomeAmount: incomeAmount.toFixed(2) },
          "Repair: level income record created",
        );

        currentUserId = ancestorId;
      }
    } catch (err) {
      report.errors++;
      logger.error({ err, investmentId: inv.id }, "Repair: error processing investment");
    }
  }

  report.totalLevelIncomeCredited = totalCredited.toFixed(2);
  logger.info(report, "Repair: seed investment repair complete");
  return report;
}
