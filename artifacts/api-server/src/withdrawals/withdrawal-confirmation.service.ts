import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { logWithdrawalEvent } from "./withdrawal-events.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS       = 30_000; // 30 seconds
const MANUAL_REVIEW_AFTER_MS = 4 * 60 * 60 * 1_000; // 4 hours without confirmation

// ── startWithdrawalConfirmationPoller ─────────────────────────────────────────

let pollerStarted = false;

/**
 * Starts the background confirmation poller.
 *
 * Runs immediately on call (to catch any pending CONFIRMING withdrawals),
 * then every POLL_INTERVAL_MS thereafter.  Safe to call multiple times —
 * idempotent via the pollerStarted guard.
 */
export function startWithdrawalConfirmationPoller(): void {
  if (pollerStarted) return;
  pollerStarted = true;

  logger.info(
    { pollIntervalMs: POLL_INTERVAL_MS },
    "WithdrawalConfirmationPoller: armed",
  );

  void runConfirmationPoll();
  setInterval(() => void runConfirmationPoll(), POLL_INTERVAL_MS);
}

// ── runConfirmationPoll ───────────────────────────────────────────────────────

async function runConfirmationPoll(): Promise<void> {
  const requiredConfirmations = parseInt(
    process.env["BSC_CONFIRMATIONS_REQUIRED"] ?? "3",
    10,
  );

  const confirming = await prisma.withdrawalRequest.findMany({
    where:   { status: "CONFIRMING", txHash: { not: null } },
    orderBy: { broadcastAt: "asc" },
    select: {
      id:          true,
      withdrawalId: true,
      txHash:      true,
      network:     true,
      broadcastAt: true,
      userId:      true,
    },
  });

  if (confirming.length === 0) return;

  logger.info(
    { count: confirming.length, requiredConfirmations },
    "WithdrawalConfirmationPoller: polling",
  );

  for (const wr of confirming) {
    try {
      await pollSingleWithdrawal(wr, requiredConfirmations);
    } catch (err) {
      logger.error(
        { withdrawalId: wr.id, txHash: wr.txHash, err },
        "WithdrawalConfirmationPoller: unexpected error — skipping",
      );
    }
  }
}

// ── pollSingleWithdrawal ──────────────────────────────────────────────────────

async function pollSingleWithdrawal(
  wr: {
    id:          string;
    withdrawalId: string | null;
    txHash:      string | null;
    network:     "BEP20";
    broadcastAt: Date | null;
    userId:      string;
  },
  requiredConfirmations: number,
): Promise<void> {
  const { id, txHash, network } = wr;
  const logCtx = { withdrawalId: wr.withdrawalId ?? id, txHash };

  if (!txHash) {
    logger.warn({ ...logCtx }, "WithdrawalConfirmationPoller: CONFIRMING withdrawal has no txHash — moving to MANUAL_REVIEW");
    await moveToManualReview(id, "CONFIRMING withdrawal missing txHash");
    return;
  }

  if (!isGatewayConfigured(network)) {
    logger.warn({ ...logCtx }, "WithdrawalConfirmationPoller: gateway not configured — skipping");
    return;
  }

  const gw = getWithdrawalGateway(network);

  let chainTx;
  try {
    chainTx = await gw.getTransaction(txHash);
  } catch (err) {
    logger.warn({ ...logCtx, err }, "WithdrawalConfirmationPoller: getTransaction RPC error — skipping this poll");
    return;
  }

  // ── Transaction not found on chain ─────────────────────────────────────────
  if (!chainTx) {
    // Check if it has been too long since broadcast (mempool expiry)
    const ageMs = wr.broadcastAt ? Date.now() - wr.broadcastAt.getTime() : MANUAL_REVIEW_AFTER_MS;
    if (ageMs >= MANUAL_REVIEW_AFTER_MS) {
      logger.warn(
        { ...logCtx, ageMs },
        "WithdrawalConfirmationPoller: transaction not found after timeout — MANUAL_REVIEW",
      );
      await moveToManualReview(id, `Transaction not found on chain after ${Math.round(ageMs / 60_000)} minutes`);
    } else {
      logger.info(
        { ...logCtx, ageMs },
        "WithdrawalConfirmationPoller: transaction not yet found (still pending in mempool)",
      );
      await logWithdrawalEvent(id, "CONFIRMATION_POLL", {
        txHash,
        status: "pending",
        confirmations: 0,
        requiredConfirmations,
      });
    }
    return;
  }

  // ── Transaction failed on chain ─────────────────────────────────────────────
  if (chainTx.status === "failed") {
    logger.warn(
      { ...logCtx, blockNumber: chainTx.blockNumber },
      "WithdrawalConfirmationPoller: transaction reverted on chain — MANUAL_REVIEW",
    );
    await moveToManualReview(id, `Transaction reverted on chain (block ${chainTx.blockNumber ?? "unknown"})`);
    return;
  }

  const confirmations = chainTx.confirmations;

  logger.info(
    { ...logCtx, confirmations, requiredConfirmations, blockNumber: chainTx.blockNumber, status: chainTx.status },
    "WithdrawalConfirmationPoller: confirmation count",
  );

  await logWithdrawalEvent(id, "CONFIRMATION_POLL", {
    txHash,
    confirmations,
    requiredConfirmations,
    blockNumber: chainTx.blockNumber,
    status:      chainTx.status,
  });

  // ── Enough confirmations — complete the withdrawal ──────────────────────────
  if (confirmations >= requiredConfirmations) {
    await completeWithdrawal(id, chainTx.blockNumber ?? 0, confirmations, txHash, wr.withdrawalId ?? id);
  }
}

// ── completeWithdrawal ────────────────────────────────────────────────────────

async function completeWithdrawal(
  id:                string,
  confirmationBlock: number,
  confirmationCount: number,
  txHash:            string,
  logId:             string,
): Promise<void> {
  await prisma.withdrawalRequest.update({
    where: { id },
    data: {
      status:            "COMPLETED",
      completedAt:       new Date(),
      confirmationBlock,
      confirmationCount,
    },
  });

  await logWithdrawalEvent(id, "CONFIRMED", {
    txHash,
    confirmationBlock,
    confirmationCount,
  });
  await logWithdrawalEvent(id, "COMPLETED", { txHash });

  logger.info(
    { withdrawalId: logId, txHash, confirmationBlock, confirmationCount, status: "COMPLETED" },
    "WithdrawalConfirmationPoller: withdrawal COMPLETED",
  );
}

// ── moveToManualReview ────────────────────────────────────────────────────────

export async function moveToManualReview(
  id:     string,
  reason: string,
): Promise<void> {
  await prisma.withdrawalRequest.update({
    where: { id },
    data: { status: "MANUAL_REVIEW", failureReason: reason },
  });

  await logWithdrawalEvent(id, "MANUAL_REVIEW", { reason });

  logger.warn(
    { withdrawalId: id, reason, status: "MANUAL_REVIEW" },
    "withdrawal: moved to MANUAL_REVIEW",
  );
}
