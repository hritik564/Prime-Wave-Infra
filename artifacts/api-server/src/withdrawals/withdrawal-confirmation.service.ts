import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { logWithdrawalEvent } from "./withdrawal-events.service";
import { getWithdrawalRequiredConfirmations } from "./withdrawal-config";

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
  const requiredConfirmations = getWithdrawalRequiredConfirmations();

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
      amount:      true,
      walletAddress: true,
      preparedTxData: true,
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
    amount:      object;
    walletAddress: string;
    preparedTxData: unknown;
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
  if (chainTx.status === "pending") {
    await logWithdrawalEvent(id, "CONFIRMATION_POLL", {
      txHash,
      confirmations,
      requiredConfirmations,
      status: "pending",
    });
    return;
  }

  const health = await gw.getHealth();
  const prepared = wr.preparedTxData as { tokenContract?: string } | null;
  const verification = gw.verifyTransfer(chainTx, {
    tokenContract: prepared?.tokenContract ?? "",
    sender: health.hotWalletAddress ?? "",
    recipient: wr.walletAddress,
    amount: wr.amount.toString(),
  });
  if (!verification.valid) {
    logger.warn(
      { ...logCtx, reason: verification.reason },
      "WithdrawalConfirmationPoller: receipt does not match intended USDT transfer — MANUAL_REVIEW",
    );
    await moveToManualReview(
      id,
      verification.reason ?? "Intended USDT transfer was not found in receipt logs",
    );
    return;
  }

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
  const explorerUrl = `https://bscscan.com/tx/${txHash}`;

  // Fetch withdrawal details needed for the wallet ledger entry
  const wr = await prisma.withdrawalRequest.findUnique({
    where:  { id },
    select: { userId: true, amount: true, walletAddress: true, network: true },
  });

  const completed = await prisma.$transaction(async (tx) => {
    const changed = await tx.withdrawalRequest.updateMany({
      where: { id, status: "CONFIRMING", txHash },
      data: {
        status:            "COMPLETED",
        completedAt:       new Date(),
        confirmationBlock,
        confirmationCount,
        explorerUrl,
      },
    });
    if (changed.count !== 1) return false;

    if (wr) {
      // Release the locked balance and record the wallet ledger entry so the
      // transaction appears in the member's Transaction History tab.
      const walletChanged = await tx.wallet.updateMany({
        where: { userId: wr.userId, lockedWithdrawalBalance: { gte: wr.amount } },
        data:  { lockedWithdrawalBalance: { decrement: wr.amount } },
      });
      if (walletChanged.count !== 1) {
        throw new Error("Withdrawal completion could not release the locked balance safely");
      }
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId: wr.userId },
        select: { id: true },
      });

      await tx.walletTransaction.create({
        data: {
          walletId:    wallet.id,
          userId:      wr.userId,
          type:        "WITHDRAWAL",
          status:      "SUCCESS",
          amount:      wr.amount,
          description: `Withdrawal completed — ${wr.network} to ${wr.walletAddress.slice(0, 10)}…`,
          metadata:    {
            withdrawalId:      id,
            network:           wr.network,
            walletAddress:     wr.walletAddress,
            txHash,
            confirmationBlock,
            confirmationCount,
            source:            "auto",
          },
          withdrawalRequestId: id,
        },
      });
    }
    return true;
  });

  if (!completed) return;

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
  const changed = await prisma.withdrawalRequest.updateMany({
    where: {
      id,
      status: { notIn: ["COMPLETED", "FAILED", "REJECTED", "CANCELLED"] },
    },
    data: { status: "MANUAL_REVIEW", failureReason: reason },
  });
  if (changed.count !== 1) return;

  await logWithdrawalEvent(id, "MANUAL_REVIEW", { reason });

  logger.warn(
    { withdrawalId: id, reason, status: "MANUAL_REVIEW" },
    "withdrawal: moved to MANUAL_REVIEW",
  );
}
