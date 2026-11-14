import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

const HALF_DAY = new Prisma.Decimal("200"); // divisor: dailyROI% / 200 = per-cycle rate

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Runs one global ROI cycle.
 * - Snapshots all ACTIVE investment IDs at cycle start.
 * - Processes each in its own transaction so a single failure is isolated.
 * - If an investment has matured (now >= maturesAt):
 *     status → MATURED, claimablePrincipal = currentPrincipal, no ROI entry.
 * - Otherwise:
 *     roiAmount = currentPrincipal × dailyROI / 200  (half-day slice of daily %)
 *     autoCompound=true  → increment currentPrincipal,  RoiLedger(wasCompounded=true)
 *     autoCompound=false → increment claimableROI,       RoiLedger(wasCompounded=false)
 */
export async function processRoiCycle(): Promise<void> {
  const cycleStart = new Date();
  logger.info({ cycleStart }, "ROI cycle: starting");

  // Snapshot IDs of all ACTIVE investments so we have a stable list for this cycle
  const active = await prisma.investment.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (active.length === 0) {
    logger.info("ROI cycle: no active investments, skipping");
    return;
  }

  let matured = 0;
  let compounded = 0;
  let credited = 0;
  let failed = 0;

  for (const { id } of active) {
    try {
      const result = await processOne(id, cycleStart);
      if (result === "matured") matured++;
      else if (result === "compounded") compounded++;
      else if (result === "credited") credited++;
      // "skipped" → investment no longer ACTIVE by the time we ran
    } catch (err) {
      failed++;
      logger.error({ err, investmentId: id }, "ROI cycle: error processing investment");
    }
  }

  logger.info(
    { total: active.length, matured, compounded, credited, failed },
    "ROI cycle: complete",
  );
}

// ── Per-investment processor ───────────────────────────────────────────────────

type ProcessResult = "matured" | "compounded" | "credited" | "skipped";

async function processOne(investmentId: string, now: Date): Promise<ProcessResult> {
  return prisma.$transaction(async (tx) => {
    // Re-read inside transaction for consistency
    const inv = await tx.investment.findUnique({
      where: { id: investmentId },
      select: {
        id:              true,
        userId:          true,
        currentPrincipal: true,
        dailyROI:        true,
        autoCompound:    true,
        maturesAt:       true,
        status:          true,
      },
    });

    // Guard: another process may have changed status already
    if (!inv || inv.status !== "ACTIVE") return "skipped";

    // ── Maturity check ────────────────────────────────────────────────────────
    if (now >= inv.maturesAt) {
      await tx.investment.update({
        where: { id: investmentId },
        data: {
          status:             "MATURED",
          claimablePrincipal: inv.currentPrincipal,
        },
      });
      return "matured";
    }

    // ── ROI calculation ───────────────────────────────────────────────────────
    // roiAmount = currentPrincipal × dailyROI% / 200
    // (dividing daily % by 200 gives the 12-hour slice as a fraction)
    const roiAmount = inv.currentPrincipal.mul(inv.dailyROI).div(HALF_DAY);

    // cycleNumber = count of existing ledger entries + 1
    const existingCycles = await tx.roiLedger.count({ where: { investmentId } });
    const cycleNumber = existingCycles + 1;

    if (inv.autoCompound) {
      // Compound: add ROI to principal
      await tx.investment.update({
        where: { id: investmentId },
        data: { currentPrincipal: { increment: roiAmount } },
      });
      await tx.roiLedger.create({
        data: {
          userId: inv.userId,
          investmentId,
          amount: roiAmount,
          cycleNumber,
          wasCompounded: true,
          wasClaimed:    false,
        },
      });
      return "compounded";
    } else {
      // Non-compound: accumulate claimable ROI
      await tx.investment.update({
        where: { id: investmentId },
        data: { claimableROI: { increment: roiAmount } },
      });
      await tx.roiLedger.create({
        data: {
          userId: inv.userId,
          investmentId,
          amount: roiAmount,
          cycleNumber,
          wasCompounded: false,
          wasClaimed:    false,
        },
      });
      return "credited";
    }
  });
}
