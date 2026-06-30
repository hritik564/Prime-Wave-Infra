import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { processRoiCycle } from "../cron/roi.engine";
import { runMatchingCycle } from "../binary/matching.engine";
import { runOrbitCycle } from "../binary/orbit.engine";
import { runSalaryCycle } from "../salary";
import { approveDeposit, rejectDeposit } from "../admin/admin-deposits.service";
import { approveWithdrawal, rejectWithdrawal } from "../admin/admin-withdrawals.service";
import { notificationService } from "../notifications/notifications.service";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { sendSuccess } from "../shared/response";
import { logger } from "../lib/logger";
import { requireAdminRoles } from "../middleware/auth.middleware";
import networkRouter from "./dev-network.router";
import seedRouter    from "./dev-seed.router";
import auditRouter   from "./dev-audit.router";

const devRouter = Router();

// ── Security gate: SUPER_ADMIN only (works in all environments) ───────────────
devRouter.use(requireAdminRoles("SUPER_ADMIN"));

// ── Network & BV generator sub-router ────────────────────────────────────────
devRouter.use("/network", networkRouter);

// ── Sprint 23B seed sub-router ───────────────────────────────────────────────
devRouter.use("/seed", seedRouter);

// ── Binary placement cache audit ─────────────────────────────────────────────
devRouter.use("/binary/audit", auditRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getDevAdminId(): Promise<string> {
  const admin = await prisma.admin.findFirst({
    where:  { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  if (!admin) {
    throw new AppError(
      "No SUPER_ADMIN found — seed one to use dev toolkit",
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "NO_ADMIN",
    );
  }
  return admin.id;
}

// ── GET /api/dev/status ───────────────────────────────────────────────────────
devRouter.get("/status", async (_req, res, next) => {
  try {
    const [lastRoi, pendingDeposits, pendingWithdrawals, activeInvestments, totalUsers] =
      await Promise.all([
        prisma.roiLedger.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        prisma.depositRequest.count({ where: { status: "PENDING" } }),
        prisma.withdrawalRequest.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
        prisma.investment.count({ where: { status: "ACTIVE" } }),
        prisma.user.count(),
      ]);

    sendSuccess(res, {
      environment:       process.env["NODE_ENV"] ?? "production",
      serverTime:        new Date().toISOString(),
      timezone:          "Europe/London",
      activeInvestments,
      pendingDeposits,
      pendingWithdrawals,
      totalUsers,
      lastRoiCycle:      lastRoi?.createdAt ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/roi/run ─────────────────────────────────────────────────────
devRouter.post("/roi/run", async (req, res, next) => {
  try {
    const cycles    = Math.max(1, Math.min(60, Number(req.body.cycles) || 1));
    const startTime = Date.now();
    const cycleStart = new Date();

    for (let i = 0; i < cycles; i++) {
      await processRoiCycle();
    }

    const execMs = Date.now() - startTime;

    const entries = await prisma.roiLedger.findMany({
      where:  { createdAt: { gte: cycleStart } },
      select: { amount: true, wasCompounded: true, investmentId: true },
    });

    const maturedCount = await prisma.investment.count({
      where: { status: "MATURED", updatedAt: { gte: cycleStart } },
    });

    const totalROI    = entries.reduce((s, e) => s + parseFloat(e.amount.toString()), 0);
    const compounded  = entries.filter(e => e.wasCompounded).reduce((s, e) => s + parseFloat(e.amount.toString()), 0);
    const claimable   = entries.filter(e => !e.wasCompounded).reduce((s, e) => s + parseFloat(e.amount.toString()), 0);
    const uniqueInvs  = new Set(entries.map(e => e.investmentId)).size;

    logger.info({ cycles, uniqueInvs, maturedCount, totalROI, execMs }, "Dev toolkit: ROI run complete");

    sendSuccess(res, {
      cycles,
      investmentsUpdated:  uniqueInvs + maturedCount,
      matured:             maturedCount,
      roiGenerated:        totalROI.toFixed(8),
      autoCompounded:      compounded.toFixed(8),
      claimableGenerated:  claimable.toFixed(8),
      executionMs:         execMs,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dev/investments ──────────────────────────────────────────────────
devRouter.get("/investments", async (_req, res, next) => {
  try {
    const investments = await prisma.investment.findMany({
      orderBy: { createdAt: "desc" },
      take:    100,
      select: {
        id:                 true,
        status:             true,
        currentPrincipal:   true,
        dailyROI:           true,
        autoCompound:       true,
        maturesAt:          true,
        claimableROI:       true,
        claimablePrincipal: true,
        createdAt:          true,
        planType:           true,
        user:               { select: { email: true, username: true } },
      },
    });
    sendSuccess(res, { investments });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/investments/:id/mature ──────────────────────────────────────
devRouter.post("/investments/:id/mature", async (req, res, next) => {
  try {
    const { id } = req.params;
    const inv = await prisma.investment.findUnique({
      where:  { id },
      select: { id: true, status: true, currentPrincipal: true },
    });
    if (!inv) throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
    if (inv.status !== "ACTIVE") {
      throw new AppError(`Investment is ${inv.status}, not ACTIVE`, HTTP_STATUS.CONFLICT, "NOT_ACTIVE");
    }

    await prisma.investment.update({
      where: { id },
      data:  { status: "MATURED", claimablePrincipal: inv.currentPrincipal, maturesAt: new Date() },
    });

    logger.info({ investmentId: id }, "Dev toolkit: investment force-matured");
    sendSuccess(res, { investmentId: id, status: "MATURED", claimablePrincipal: inv.currentPrincipal.toString() });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/investments/:id/reset ──────────────────────────────────────
devRouter.post("/investments/:id/reset", async (req, res, next) => {
  try {
    const { id } = req.params;
    const inv = await prisma.investment.findUnique({
      where:  { id },
      select: { id: true, status: true, planType: true },
    });
    if (!inv) throw new AppError("Investment not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");

    // Use a sensible default; real plans are 90–365 days
    const days = 90;
    const newMatures = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.investment.update({
      where: { id },
      data:  {
        status:             "ACTIVE",
        claimablePrincipal: new Prisma.Decimal(0),
        claimableROI:       new Prisma.Decimal(0),
        maturesAt:          newMatures,
      },
    });

    logger.info({ investmentId: id, newMatures }, "Dev toolkit: investment reset to ACTIVE");
    sendSuccess(res, { investmentId: id, status: "ACTIVE", maturesAt: newMatures.toISOString() });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dev/deposits/pending ─────────────────────────────────────────────
devRouter.get("/deposits/pending", async (_req, res, next) => {
  try {
    const deposits = await prisma.depositRequest.findMany({
      where:   { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take:    50,
      select: {
        id:        true,
        amount:    true,
        network:   true,
        status:    true,
        createdAt: true,
        user:      { select: { email: true, username: true } },
      },
    });
    sendSuccess(res, { deposits });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/deposits/:id/approve ───────────────────────────────────────
devRouter.post("/deposits/:id/approve", async (req, res, next) => {
  try {
    const adminId = await getDevAdminId();
    const result  = await approveDeposit(adminId, req.params.id);
    logger.info({ depositId: req.params.id }, "Dev toolkit: deposit approved");
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/deposits/:id/reject ────────────────────────────────────────
devRouter.post("/deposits/:id/reject", async (req, res, next) => {
  try {
    const adminId = await getDevAdminId();
    const result  = await rejectDeposit(adminId, req.params.id, {
      rejectedReason: (req.body.reason as string | undefined) ?? "Rejected via Developer Testing Toolkit",
    });
    logger.info({ depositId: req.params.id }, "Dev toolkit: deposit rejected");
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dev/withdrawals/pending ─────────────────────────────────────────
devRouter.get("/withdrawals/pending", async (_req, res, next) => {
  try {
    const withdrawals = await prisma.withdrawalRequest.findMany({
      where:   { status: { in: ["PENDING", "APPROVED"] } },
      orderBy: { createdAt: "asc" },
      take:    50,
      select: {
        id:            true,
        amount:        true,
        network:       true,
        status:        true,
        walletAddress: true,
        createdAt:     true,
        user:          { select: { email: true, username: true } },
      },
    });
    sendSuccess(res, { withdrawals });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/withdrawals/:id/approve ────────────────────────────────────
devRouter.post("/withdrawals/:id/approve", async (req, res, next) => {
  try {
    const adminId = await getDevAdminId();
    const result  = await approveWithdrawal(adminId, req.params.id, {
      adminNotes: "Approved via Developer Testing Toolkit",
    });
    logger.info({ withdrawalId: req.params.id }, "Dev toolkit: withdrawal approved");
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/withdrawals/:id/reject ─────────────────────────────────────
devRouter.post("/withdrawals/:id/reject", async (req, res, next) => {
  try {
    const adminId = await getDevAdminId();
    const result  = await rejectWithdrawal(adminId, req.params.id, {
      rejectedReason: (req.body.reason as string | undefined) ?? "Rejected via Developer Testing Toolkit",
      adminNotes:     "Rejected via Developer Testing Toolkit",
    });
    logger.info({ withdrawalId: req.params.id }, "Dev toolkit: withdrawal rejected");
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/withdrawals/:id/cancel ─────────────────────────────────────
devRouter.post("/withdrawals/:id/cancel", async (req, res, next) => {
  try {
    const wr = await prisma.withdrawalRequest.findUnique({
      where:  { id: req.params.id },
      select: { id: true, status: true, userId: true, amount: true },
    });
    if (!wr) throw new AppError("Withdrawal not found", HTTP_STATUS.NOT_FOUND, "NOT_FOUND");
    if (!["PENDING", "APPROVED"].includes(wr.status)) {
      throw new AppError(`Cannot cancel a ${wr.status} withdrawal`, HTTP_STATUS.CONFLICT, "NOT_CANCELLABLE");
    }

    await prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.update({
        where: { id: wr.id },
        data:  { status: "CANCELLED" },
      });
      await tx.wallet.update({
        where: { userId: wr.userId },
        data:  { withdrawalWallet: { increment: wr.amount } },
      });
    });

    logger.info({ withdrawalId: wr.id }, "Dev toolkit: withdrawal cancelled & refunded");
    sendSuccess(res, { withdrawalId: wr.id, status: "CANCELLED", refunded: wr.amount.toString() });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/transfers/release ──────────────────────────────────────────
// Moves all income-wallet balances → withdrawal-wallet (minus 15% fee), for
// every user who has a non-zero income balance.
devRouter.post("/transfers/release", async (_req, res, next) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where:  { incomeWallet: { gt: 0 } },
      select: { id: true, userId: true, incomeWallet: true },
    });

    if (wallets.length === 0) {
      sendSuccess(res, { transferred: 0, totalNetAmount: "0.00", message: "No income balances to release" });
      return;
    }

    const FEE   = new Prisma.Decimal("15");
    const HUNDO = new Prisma.Decimal("100");
    let transferred  = 0;
    let totalNet     = new Prisma.Decimal(0);

    for (const w of wallets) {
      try {
        const fee = w.incomeWallet.mul(FEE).div(HUNDO);
        const net = w.incomeWallet.sub(fee);

        await prisma.$transaction([
          prisma.wallet.update({
            where: { id: w.id },
            data:  { incomeWallet: new Prisma.Decimal(0), withdrawalWallet: { increment: net } },
          }),
          prisma.walletTransaction.create({
            data: {
              walletId:    w.id,
              userId:      w.userId,
              type:        "INCOME_TRANSFER",
              status:      "SUCCESS",
              amount:      net,
              description: "Income→Withdrawal release via dev toolkit (15% fee)",
              metadata:    { gross: w.incomeWallet.toString(), fee: fee.toString(), net: net.toString() },
            },
          }),
        ]);

        totalNet = totalNet.add(net);
        transferred++;
      } catch (err) {
        logger.error({ err, userId: w.userId }, "Dev toolkit: transfer failed for user");
      }
    }

    logger.info({ transferred, totalNet: totalNet.toFixed(2) }, "Dev toolkit: transfer release complete");
    sendSuccess(res, { transferred, totalNetAmount: totalNet.toFixed(2) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/binary/matching ────────────────────────────────────────────
devRouter.post("/binary/matching", async (_req, res, next) => {
  try {
    const t      = Date.now();
    const result = await runMatchingCycle();
    sendSuccess(res, {
      executionMs:     Date.now() - t,
      processed:       result?.processed        ?? 0,
      skipped:         result?.skipped          ?? 0,
      incomeGenerated: `$${result?.totalIncome.toFixed(2)        ?? "0.00"}`,
      matchedBV:       result?.totalMatchedBV.toFixed(2)         ?? "0.00",
      rewardedBV:      result?.totalRewardedBV.toFixed(2)        ?? "0.00",
      flushedBV:       result?.totalFlushedBV.toFixed(2)         ?? "0.00",
      carryFwdLeft:    result?.totalCarryFwdLeft.toFixed(2)      ?? "0.00",
      carryFwdRight:   result?.totalCarryFwdRight.toFixed(2)     ?? "0.00",
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/binary/orbit ───────────────────────────────────────────────
devRouter.post("/binary/orbit", async (_req, res, next) => {
  try {
    const t      = Date.now();
    const result = await runOrbitCycle();
    sendSuccess(res, {
      executionMs:     Date.now() - t,
      processed:       result?.processed        ?? 0,
      skipped:         result?.skipped          ?? 0,
      incomeGenerated: `$${result?.totalIncome.toFixed(2)        ?? "0.00"}`,
      matchedBV:       result?.totalMatchedBV.toFixed(2)         ?? "0.00",
      flushedBV:       result?.totalFlushedBV.toFixed(2)         ?? "0.00",
      carryFwdLeft:    result?.totalCarryFwdLeft.toFixed(2)      ?? "0.00",
      carryFwdRight:   result?.totalCarryFwdRight.toFixed(2)     ?? "0.00",
      rewards:         result?.totalRewards     ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/binary/salary ──────────────────────────────────────────────
devRouter.post("/binary/salary", async (_req, res, next) => {
  try {
    const t = Date.now();
    await runSalaryCycle();
    sendSuccess(res, { executionMs: Date.now() - t });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/notifications/generate ─────────────────────────────────────
devRouter.post("/notifications/generate", async (req, res, next) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new AppError("userId required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    const types = ["DEPOSIT_APPROVED", "ROI_CLAIMED", "BINARY_MATCH_INCOME", "LEVEL_INCOME", "SALARY_RECEIVED"] as const;
    const type  = types[Math.floor(Math.random() * types.length)];

    await notificationService.create({
      userId,
      type,
      title:    "Developer Test Notification",
      message:  `Test notification generated at ${new Date().toLocaleTimeString()} by the dev toolkit.`,
      metadata: { source: "dev-toolkit" },
    });

    sendSuccess(res, { userId, type });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/notifications/mark-all-read ────────────────────────────────
devRouter.post("/notifications/mark-all-read", async (req, res, next) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new AppError("userId required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    const result = await notificationService.markAllRead(userId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dev/notifications/clear ────────────────────────────────────────
devRouter.post("/notifications/clear", async (req, res, next) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) throw new AppError("userId required", HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST");

    const result = await prisma.notification.deleteMany({ where: { userId } });
    sendSuccess(res, { deleted: result.count });
  } catch (err) {
    next(err);
  }
});

export default devRouter;
