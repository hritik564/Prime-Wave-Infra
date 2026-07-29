import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { writeLedgerEntry } from "../ledger/ledger.service";

/**
 * One-time startup hook — credits the missed Binary Orbit income for master
 * from the July 28 2026 12:00 London cycle.
 *
 * Root cause: the orbit engine found rightBV = 0 because the matching engine
 * (running immediately before it on the old shared-pool code) had already
 * flushed all BV from the shared columns.  Before that flush, master had
 * matchedBV = 150 → 1 reward × $500 = $500 owed.
 *
 * Guard: system_settings key "orbit.backfill.2026-07-28.done".
 * - If the key exists → skip (already credited or not needed).
 * - If master already has ≥ 1 BinaryOrbitIncome record → set flag and skip.
 * - Otherwise → credit $500, create canonical records, set flag.
 *
 * Safe to call on every startup — idempotent after the first successful run.
 */
export async function creditMissedOrbitIncome(): Promise<void> {
  const FLAG_KEY = "orbit.backfill.2026-07-28.done";

  try {
    // ── Guard: already done? ─────────────────────────────────────────────────
    const flag = await prisma.systemSettings.findUnique({
      where:  { key: FLAG_KEY },
      select: { id: true },
    });
    if (flag) {
      logger.info({ flagKey: FLAG_KEY }, "OrbitBackfill: flag set — skipping");
      return;
    }

    // ── Find master (root of binary tree) ───────────────────────────────────
    const master = await prisma.user.findFirst({
      where:  { binaryParentId: null },
      select: { id: true, username: true },
    });
    if (!master) {
      logger.warn("OrbitBackfill: no root user found — skipping");
      return;
    }

    // ── Guard: already has orbit income records? ─────────────────────────────
    const existingCount = await prisma.binaryOrbitIncome.count({
      where: { userId: master.id },
    });
    if (existingCount > 0) {
      logger.info(
        { userId: master.id, existingCount },
        "OrbitBackfill: master already has orbit income — marking done",
      );
      await prisma.systemSettings.create({ data: { key: FLAG_KEY, value: "true" } });
      return;
    }

    // ── Credit the missed $500 ───────────────────────────────────────────────
    // Cycle boundaries match the actual July 28 12:00 London cycle.
    const cycleEnd   = new Date("2026-07-28T11:03:33.149Z"); // actual matching cycle end
    const cycleStart = new Date(cycleEnd.getTime() - 12 * 60 * 60 * 1_000);

    const matchedBV    = new Prisma.Decimal("150");
    const incomeAmount = new Prisma.Decimal("500");
    const bvPerReward  = 150;
    const rewardCount  = 1;

    await prisma.$transaction(async (tx) => {
      // 1. Credit withdrawal wallet
      const wallet = await tx.wallet.update({
        where:  { userId: master.id },
        data:   { withdrawalWallet: { increment: incomeAmount } },
        select: { id: true, withdrawalWallet: true },
      });

      // 2. Canonical BinaryOrbitIncome record
      await tx.binaryOrbitIncome.create({
        data: {
          userId:              master.id,
          matchedBV,
          rewardCount,
          destroyedRewardCount: 0,
          flushedBV:           matchedBV,
          carryForwardLeft:    new Prisma.Decimal("0"),
          carryForwardRight:   new Prisma.Decimal("0"),
          incomeAmount,
          cycleStart,
          cycleEnd,
        },
      });

      // 3. WalletTransaction audit trail
      await tx.walletTransaction.create({
        data: {
          walletId:    wallet.id,
          userId:      master.id,
          type:        "BINARY_ORBIT",
          status:      "SUCCESS",
          amount:      incomeAmount,
          description: `Binary orbit income (backfill) — 1 orbit × $500 — cycle ${cycleStart.toISOString()} (shared-pool bug credit)`,
          metadata:    {
            matchedBV:         matchedBV.toFixed(8),
            rewardCount,
            payableRewardCount: rewardCount,
            destroyedRewardCount: 0,
            flushedBV:         matchedBV.toFixed(8),
            carryForwardLeft:  "0.00000000",
            carryForwardRight: "0.00000000",
            bvPerReward,
            cycleStart,
            cycleEnd,
            backfillReason:    "Orbit engine starved by shared BV pool — matching flushed rightBV before orbit ran",
          },
        },
      });

      // 4. Set guard flag atomically
      await tx.systemSettings.create({
        data: { key: FLAG_KEY, value: "true" },
      });

      // 5. Ledger entry (fire-and-forget outside tx to avoid blocking)
      void writeLedgerEntry({
        referenceId:     master.id,
        referenceType:   "binary_orbit_backfill",
        memberId:        master.id,
        username:        master.username,
        transactionType: "ORBIT_INCOME",
        amount:          incomeAmount,
        debitCredit:     "CREDIT",
        walletType:      "WITHDRAWAL_WALLET",
        closingBalance:  wallet.withdrawalWallet,
        metadata:        { matchedBV: matchedBV.toFixed(8), rewardCount, cycleStart, cycleEnd, backfill: true },
      }).catch(err => logger.error({ err }, "OrbitBackfill: ledger write failed"));
    });

    logger.info(
      { userId: master.id, username: master.username, incomeAmount: incomeAmount.toFixed(2), cycleStart, cycleEnd },
      "OrbitBackfill: $500 orbit income credited successfully",
    );
  } catch (err) {
    // Never crash the server — log and continue
    logger.error({ err }, "OrbitBackfill: unexpected error — server will continue");
  }
}
