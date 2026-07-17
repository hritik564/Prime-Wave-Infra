import { prisma } from "../config/prisma";
import { getWithdrawalEngineStatus, type WithdrawalEngineStatus } from "./withdrawal-engine.service";
import { checkHotWalletStatus, type HotWalletStatus } from "./withdrawal-hot-wallet.service";

// ── Withdrawal Operational Health ─────────────────────────────────────────────
//
// Single aggregated snapshot for the admin Operational Health dashboard.
// Fetches all data in parallel for low latency.

export interface QueueStats {
  waiting:      number;   // PENDING still within hold period
  eligible:     number;   // PENDING past hold period, ready to process
  validating:   number;
  queued:       number;
  processing:   number;
  signed:       number;
  broadcasting: number;
  confirming:   number;
  manualReview: number;
  total:        number;
}

export interface LastProcessedWithdrawal {
  id:           string;
  withdrawalId: string | null;
  amount:       string;
  completedAt:  string;
}

export interface OperationalHealthAlert {
  level:   "error" | "warning" | "info";
  code:    string;
  message: string;
}

export interface OperationalHealth {
  engine:            WithdrawalEngineStatus;
  hotWallet:         HotWalletStatus;
  queue:             QueueStats;
  lastProcessed:     LastProcessedWithdrawal | null;
  alerts:            OperationalHealthAlert[];
  snapshotAt:        string;
}

export async function getOperationalHealth(): Promise<OperationalHealth> {
  const holdMinutes  = parseInt(process.env["WITHDRAWAL_HOLD_MINUTES"] ?? "2", 10);
  const holdCutoff   = new Date(Date.now() - holdMinutes * 60 * 1_000);
  const snapshotAt   = new Date().toISOString();

  const manualReviewThreshold = 3; // alert if >= this many in MANUAL_REVIEW
  const confirmingDelayMs = 2 * 60 * 60 * 1_000; // alert if confirming > 2h
  const confirmingDelayCutoff = new Date(Date.now() - confirmingDelayMs);

  const [
    engineStatus,
    hotWallet,

    waitingCount,
    eligibleCount,
    validatingCount,
    queuedCount,
    processingCount,
    signedCount,
    broadcastingCount,
    confirmingCount,
    manualReviewCount,

    longConfirmingCount,
    lastProcessed,
  ] = await Promise.all([
    getWithdrawalEngineStatus(),
    checkHotWalletStatus(),

    // PENDING inside hold window
    prisma.withdrawalRequest.count({
      where: { status: "PENDING", requestedAt: { gt: holdCutoff } },
    }),
    // PENDING past hold window (eligible for pickup)
    prisma.withdrawalRequest.count({
      where: { status: "PENDING", requestedAt: { lte: holdCutoff } },
    }),
    prisma.withdrawalRequest.count({ where: { status: "VALIDATING" } }),
    prisma.withdrawalRequest.count({ where: { status: "QUEUED" } }),
    prisma.withdrawalRequest.count({ where: { status: "PROCESSING" } }),
    prisma.withdrawalRequest.count({ where: { status: "SIGNED" } }),
    prisma.withdrawalRequest.count({ where: { status: "BROADCASTING" } }),
    prisma.withdrawalRequest.count({ where: { status: "CONFIRMING" } }),
    prisma.withdrawalRequest.count({ where: { status: "MANUAL_REVIEW" } }),

    // CONFIRMING for > 2 hours (delayed confirmation alert)
    prisma.withdrawalRequest.count({
      where: { status: "CONFIRMING", broadcastAt: { lte: confirmingDelayCutoff } },
    }),

    // Most recent COMPLETED withdrawal
    prisma.withdrawalRequest.findFirst({
      where:   { status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: {
        id:          true,
        withdrawalId: true,
        netAmount:   true,
        completedAt: true,
      },
    }),
  ]);

  const queue: QueueStats = {
    waiting:      waitingCount,
    eligible:     eligibleCount,
    validating:   validatingCount,
    queued:       queuedCount,
    processing:   processingCount,
    signed:       signedCount,
    broadcasting: broadcastingCount,
    confirming:   confirmingCount,
    manualReview: manualReviewCount,
    total: waitingCount + eligibleCount + validatingCount + queuedCount +
           processingCount + signedCount + broadcastingCount + confirmingCount +
           manualReviewCount,
  };

  // ── Build alert list ─────────────────────────────────────────────────────────
  const alerts: OperationalHealthAlert[] = [];

  if (!engineStatus.enabled) {
    alerts.push({
      level:   "warning",
      code:    "ENGINE_PAUSED",
      message: "Withdrawal engine is paused — queue processing is suspended",
    });
  }

  for (const walletAlert of hotWallet.alerts) {
    alerts.push({
      level:   "error",
      code:    walletAlert.toLowerCase().includes("bnb") ? "LOW_BNB" : "LOW_USDT",
      message: walletAlert,
    });
  }

  if (manualReviewCount >= manualReviewThreshold) {
    alerts.push({
      level:   "error",
      code:    "EXCESSIVE_MANUAL_REVIEW",
      message: `${manualReviewCount} withdrawals are in MANUAL_REVIEW and need admin action`,
    });
  }

  if (longConfirmingCount > 0) {
    alerts.push({
      level:   "warning",
      code:    "CONFIRMATION_DELAY",
      message: `${longConfirmingCount} withdrawal${longConfirmingCount > 1 ? "s have" : " has"} been CONFIRMING for more than 2 hours`,
    });
  }

  if (processingCount > 0 || signedCount > 0 || broadcastingCount > 0) {
    const stuckCount = processingCount + signedCount + broadcastingCount;
    alerts.push({
      level:   "warning",
      code:    "PROCESSOR_STUCK",
      message: `${stuckCount} withdrawal${stuckCount > 1 ? "s are" : " is"} stuck mid-processing (PROCESSING/SIGNED/BROADCASTING)`,
    });
  }

  const formattedLastProcessed: LastProcessedWithdrawal | null = lastProcessed
    ? {
        id:          lastProcessed.id,
        withdrawalId: lastProcessed.withdrawalId,
        amount:      lastProcessed.netAmount.toString(),
        completedAt: lastProcessed.completedAt?.toISOString() ?? "",
      }
    : null;

  return {
    engine:        engineStatus,
    hotWallet,
    queue,
    lastProcessed: formattedLastProcessed,
    alerts,
    snapshotAt,
  };
}
