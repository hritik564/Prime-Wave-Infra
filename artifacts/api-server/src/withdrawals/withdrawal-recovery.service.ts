import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { logWithdrawalEvent } from "./withdrawal-events.service";
import { moveToManualReview } from "./withdrawal-confirmation.service";

// ── startWithdrawalRecovery ───────────────────────────────────────────────────

/**
 * One-shot recovery scan that runs on server startup.
 *
 * Scans all withdrawals stuck in SIGNED, BROADCASTING, or CONFIRMING state
 * and attempts to determine their blockchain status safely.
 *
 * SAFETY RULES:
 *   - Never rebroadcasts a transaction.
 *   - Never assumes a transaction was sent without a txHash in the DB.
 *   - Any ambiguous state → MANUAL_REVIEW for human inspection.
 */
export async function startWithdrawalRecovery(): Promise<void> {
  logger.info("WithdrawalRecovery: starting startup scan");

  const stuck = await prisma.withdrawalRequest.findMany({
    where:  { status: { in: ["SIGNED", "BROADCASTING", "CONFIRMING"] } },
    select: {
      id:          true,
      withdrawalId: true,
      status:      true,
      txHash:      true,
      network:     true,
      broadcastAt: true,
      userId:      true,
    },
  });

  if (stuck.length === 0) {
    logger.info("WithdrawalRecovery: no stuck withdrawals found — clean startup");
    return;
  }

  logger.warn(
    { count: stuck.length, statuses: countByStatus(stuck) },
    "WithdrawalRecovery: found stuck withdrawals — scanning",
  );

  const requiredConfirmations = parseInt(
    process.env["BSC_CONFIRMATIONS_REQUIRED"] ?? "3",
    10,
  );

  for (const wr of stuck) {
    try {
      await recoverSingle(wr, requiredConfirmations);
    } catch (err) {
      logger.error(
        { withdrawalId: wr.id, status: wr.status, err },
        "WithdrawalRecovery: unexpected error during recovery — leaving as-is for manual inspection",
      );
    }
  }

  logger.info("WithdrawalRecovery: scan complete");
}

// ── recoverSingle ─────────────────────────────────────────────────────────────

async function recoverSingle(
  wr: {
    id:          string;
    withdrawalId: string | null;
    status:      string;
    txHash:      string | null;
    network:     "BEP20";
    broadcastAt: Date | null;
    userId:      string;
  },
  requiredConfirmations: number,
): Promise<void> {
  const { id, status, txHash, network } = wr;
  const logCtx = { withdrawalId: wr.withdrawalId ?? id, status, txHash };

  await logWithdrawalEvent(id, "RECOVERY_SCAN", {
    previousStatus: status,
    hasTxHash:      !!txHash,
  });

  // ── SIGNED or BROADCASTING without a txHash ───────────────────────────────
  // These are inherently ambiguous: the server crashed before we could confirm
  // whether the transaction was actually broadcast.  Never rebroadcast.
  if ((status === "SIGNED" || status === "BROADCASTING") && !txHash) {
    logger.warn(
      { ...logCtx },
      "WithdrawalRecovery: withdrawal stuck in SIGNED/BROADCASTING with no txHash — MANUAL_REVIEW",
    );
    await moveToManualReview(
      id,
      `Server crash detected during ${status} phase — no txHash recorded. Manual verification required.`,
    );
    return;
  }

  // ── Any status with a txHash — verify on chain ────────────────────────────
  if (txHash) {
    if (!isGatewayConfigured(network)) {
      logger.warn(
        { ...logCtx },
        "WithdrawalRecovery: gateway not configured — cannot verify txHash — MANUAL_REVIEW",
      );
      await moveToManualReview(id, "Blockchain gateway not configured for recovery check");
      return;
    }

    const gw = getWithdrawalGateway(network);
    let chainTx;

    try {
      chainTx = await gw.getTransaction(txHash);
    } catch (err) {
      logger.warn(
        { ...logCtx, err },
        "WithdrawalRecovery: RPC error during recovery check — leaving as CONFIRMING for poller",
      );
      return;
    }

    if (!chainTx) {
      // Transaction not found on chain
      logger.warn(
        { ...logCtx },
        "WithdrawalRecovery: txHash not found on chain — MANUAL_REVIEW",
      );
      await moveToManualReview(id, `Transaction ${txHash} not found on chain during recovery scan`);
      return;
    }

    if (chainTx.status === "failed") {
      logger.warn(
        { ...logCtx, blockNumber: chainTx.blockNumber },
        "WithdrawalRecovery: transaction reverted on chain — MANUAL_REVIEW",
      );
      await moveToManualReview(
        id,
        `Transaction ${txHash} reverted on chain at block ${chainTx.blockNumber ?? "unknown"}`,
      );
      return;
    }

    if (chainTx.status === "pending") {
      logger.info(
        { ...logCtx },
        "WithdrawalRecovery: transaction still pending — ensuring CONFIRMING status",
      );
      if (status !== "CONFIRMING") {
        await prisma.withdrawalRequest.update({
          where: { id },
          data:  { status: "CONFIRMING" },
        });
        await logWithdrawalEvent(id, "CONFIRMING", { recoveredFrom: status, txHash });
      }
      return;
    }

    // Transaction is mined — check confirmations
    const confirmations = chainTx.confirmations;

    logger.info(
      { ...logCtx, confirmations, requiredConfirmations, blockNumber: chainTx.blockNumber },
      "WithdrawalRecovery: transaction found on chain",
    );

    if (confirmations >= requiredConfirmations) {
      await prisma.withdrawalRequest.update({
        where: { id },
        data:  {
          status:            "COMPLETED",
          completedAt:       new Date(),
          confirmationBlock: chainTx.blockNumber ?? 0,
          confirmationCount: confirmations,
          txHash,
        },
      });
      await logWithdrawalEvent(id, "CONFIRMED", {
        txHash,
        confirmationBlock: chainTx.blockNumber,
        confirmationCount: confirmations,
        recoveredFrom:     status,
      });
      await logWithdrawalEvent(id, "COMPLETED", { txHash, recoveredViaStartup: true });

      logger.info(
        { ...logCtx, confirmationBlock: chainTx.blockNumber, confirmationCount: confirmations, status: "COMPLETED" },
        "WithdrawalRecovery: withdrawal completed via recovery",
      );
    } else {
      // Not enough confirmations yet — move to CONFIRMING and let poller handle it
      if (status !== "CONFIRMING") {
        await prisma.withdrawalRequest.update({
          where: { id },
          data:  { status: "CONFIRMING", txHash },
        });
        await logWithdrawalEvent(id, "CONFIRMING", { recoveredFrom: status, txHash });
      }
      logger.info(
        { ...logCtx, confirmations, requiredConfirmations },
        "WithdrawalRecovery: transaction found but not enough confirmations — CONFIRMING (poller will complete)",
      );
    }

    return;
  }

  // ── Fallback: unknown combination ─────────────────────────────────────────
  logger.warn(
    { ...logCtx },
    "WithdrawalRecovery: unhandled recovery case — MANUAL_REVIEW",
  );
  await moveToManualReview(id, "Unhandled recovery case — please inspect manually");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function countByStatus(rows: Array<{ status: string }>): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
}
