import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { getWithdrawalSettings } from "./withdrawals.service";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { GatewaySigningError, GatewayBroadcastError } from "../services/blockchain/blockchain.interface";
import type { PreparedTransfer } from "../services/blockchain/blockchain.types";
import { logWithdrawalEvent } from "./withdrawal-events.service";
import { moveToManualReview } from "./withdrawal-confirmation.service";
import { isWithdrawalEngineEnabled } from "./withdrawal-engine.service";
import { checkHotWalletStatus } from "./withdrawal-hot-wallet.service";
import { buildExplorerUrl } from "./withdrawal-hot-wallet.service";
import {
  claimPendingWithdrawals,
  releaseClaimAfterUnexpectedError,
  releaseDryRunClaim,
  recoverExpiredClaims,
  renewWithdrawalClaim,
  transitionClaimedWithdrawal,
  WITHDRAWAL_WORKER_ID,
} from "./withdrawal-claims.service";
import {
  decideProcessorFailure,
  type ProcessorFailureEvidence,
} from "./withdrawal-failure-decision";

/**
 * Withdrawal Processor Service — Sprint 31E
 *
 * Added operational controls:
 *   1. Engine switch  — skip entire batch if engine is disabled
 *   2. Hot wallet guard — skip batch if BNB or USDT is below minimum thresholds
 *   3. Hold period    — ignore APPROVED withdrawals younger than WITHDRAWAL_HOLD_MINUTES
 *   4. Risk limits    — large / high-frequency withdrawals → MANUAL_REVIEW (no refund)
 *
 * Core state machine remains: PENDING → APPROVED → QUEUED → PROCESSING →
 * SIGNED → BROADCASTING → CONFIRMING  (Sprint 31C/D unchanged)
 */

interface ProcessResult {
  processed: number;
  failed:    number;
  skipped:   number;
  errors:    string[];
  reason?:   string;
}

export async function processPendingWithdrawals(): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, failed: 0, skipped: 0, errors: [] };

  // ── 1. Engine switch ─────────────────────────────────────────────────────────
  const engineOn = await isWithdrawalEngineEnabled();
  if (!engineOn) {
    logger.info("withdrawal.processor: engine is OFF — batch skipped");
    return { ...result, skipped: -1, reason: "Withdrawal engine is disabled" };
  }

  // ── 2. Hot wallet guard ──────────────────────────────────────────────────────
  const walletStatus = await checkHotWalletStatus();
  if (walletStatus.configured && !walletStatus.isSufficient) {
    logger.warn(
      { alerts: walletStatus.alerts },
      "withdrawal.processor: hot wallet below threshold — batch paused",
    );
    return {
      ...result,
      skipped: -1,
      reason: `Hot wallet insufficient: ${walletStatus.alerts.join("; ")}`,
    };
  }

  // ── 3. Hold period filter ────────────────────────────────────────────────────
  const holdMinutes = parseInt(process.env["WITHDRAWAL_HOLD_MINUTES"] ?? "2", 10);
  const holdCutoff  = new Date(Date.now() - holdMinutes * 60 * 1_000);
  await recoverExpiredClaims();
  const pending = await claimPendingWithdrawals(holdCutoff, 20);

  const waitingCount = await prisma.withdrawalRequest.count({
    where: { status: "APPROVED", requestedAt: { gt: holdCutoff } },
  });

  logger.info(
    { count: pending.length, waiting: waitingCount, holdMinutes },
    "withdrawal.processor: starting batch",
  );

  for (const wr of pending) {
    try {
      await runSingleWithdrawal(wr);
      result.processed++;
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${wr.withdrawalId ?? wr.id}: ${msg}`);
      logger.error({ withdrawalId: wr.id, err }, "withdrawal.processor: error processing withdrawal");
      await releaseClaimAfterUnexpectedError(wr.id, wr.claimToken);
    }
  }

  logger.info({ ...result, waiting: waitingCount }, "withdrawal.processor: batch complete");
  return result;
}

async function runSingleWithdrawal(wr: {
  id:                    string;
  withdrawalId:          string | null;
  userId:                string;
  amount:                object;
  network:               "BEP20";
  walletAddressSnapshot: string;
  idempotencyKey:        string;
  requestedAt:           Date;
  claimToken:            string;
}): Promise<void> {
  const { id, withdrawalId: wId, idempotencyKey, claimToken } = wr;
  const logCtx = { withdrawalId: wId ?? id, idempotencyKey, workerId: WITHDRAWAL_WORKER_ID };

  await logWithdrawalEvent(id, "VALIDATED");
  logger.info({ ...logCtx, status: "QUEUED" }, "withdrawal.processor: validating");

  // ── Run validations ──────────────────────────────────────────────────────────
  const validation = await validateWithdrawal(wr);

  if (validation) {
    if (validation.action === "manual_review") {
      await transitionClaimedWithdrawal(id, claimToken, ["QUEUED"], "MANUAL_REVIEW", {
        failureReason: validation.reason,
      });
      await logWithdrawalEvent(id, "MANUAL_REVIEW", { reason: validation.reason });
      logger.warn({ ...logCtx, reason: validation.reason }, "withdrawal.processor: risk limit → MANUAL_REVIEW");
    } else {
      await handleProcessorFailure({
        id,
        claimToken,
        previousStatus: "QUEUED",
        reason: validation.reason,
        evidence: { status: "QUEUED", signingOrBroadcastingDidNotOccur: true },
      });
      logger.warn({ ...logCtx, reason: validation.reason }, "withdrawal.processor: failed validation");
    }
    return;
  }

  // ── QUEUED → PROCESSING ──────────────────────────────────────────────────────
  if (!await transitionClaimedWithdrawal(id, claimToken, ["QUEUED"], "PROCESSING", {
    processedAt: new Date(),
  })) {
    throw new Error("Withdrawal claim lost before PROCESSING transition");
  }
  await logWithdrawalEvent(id, "PROCESSING");
  logger.info({ ...logCtx, status: "PROCESSING" }, "withdrawal.processor: reached PROCESSING");

  // ── Prepare transaction ──────────────────────────────────────────────────────
  const prepared = await prepareBlockchainTransfer(id, wr, logCtx, claimToken);

  // ── Sign + broadcast ─────────────────────────────────────────────────────────
  await signAndBroadcastWithdrawal(id, wr, prepared, logCtx, claimToken);
}

// ── validateWithdrawal ────────────────────────────────────────────────────────

type ValidationResult =
  | null
  | { reason: string; action: "fail" }
  | { reason: string; action: "manual_review" };

async function validateWithdrawal(wr: {
  id:                    string;
  userId:                string;
  amount:                object;
  network:               "BEP20";
  walletAddressSnapshot: string;
  requestedAt:           Date;
}): Promise<ValidationResult> {
  const { Prisma } = await import("@prisma/client");
  const amount = wr.amount as import("@prisma/client").Prisma.Decimal;

  // ── User account status ──────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where:  { id: wr.userId },
    select: { status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    return { reason: "User account is not active", action: "fail" };
  }

  // ── Withdrawal settings ──────────────────────────────────────────────────────
  const settings = await getWithdrawalSettings(wr.network);
  if (!settings.isEnabled) {
    return { reason: `Withdrawals are currently disabled for ${wr.network}`, action: "fail" };
  }
  if (amount.lt(settings.minimumAmount)) {
    return {
      reason: `Amount is below current minimum of $${settings.minimumAmount.toFixed(2)}`,
      action: "fail",
    };
  }
  if (amount.gt(settings.maximumAmount)) {
    return {
      reason: `Amount exceeds current maximum of $${settings.maximumAmount.toFixed(2)}`,
      action: "fail",
    };
  }

  // ── Address verification ─────────────────────────────────────────────────────
  const verifiedAddress = await prisma.walletAddress.findFirst({
    where: { userId: wr.userId, network: wr.network, address: wr.walletAddressSnapshot, isVerified: true },
  });
  if (!verifiedAddress) {
    return { reason: "Wallet address is no longer verified on this account", action: "fail" };
  }

  // ── Locked balance ───────────────────────────────────────────────────────────
  const wallet = await prisma.wallet.findUnique({
    where:  { userId: wr.userId },
    select: { lockedWithdrawalBalance: true },
  });
  if (!wallet || wallet.lockedWithdrawalBalance.lt(amount)) {
    return { reason: "Insufficient locked balance for this withdrawal", action: "fail" };
  }

  // ── Risk limits → MANUAL_REVIEW ─────────────────────────────────────────────

  // 1. Single withdrawal cap
  const maxSingle = process.env["MAX_SINGLE_WITHDRAWAL"];
  if (maxSingle) {
    const cap = parseFloat(maxSingle);
    if (Number.isFinite(cap) && amount.gt(new Prisma.Decimal(cap))) {
      return {
        reason: `Withdrawal amount $${amount.toFixed(2)} exceeds single-withdrawal risk limit of $${cap.toFixed(2)}`,
        action: "manual_review",
      };
    }
  }

  // 2. Daily per-user cap (last 24 hours, non-terminal statuses)
  const maxDaily = process.env["MAX_DAILY_WITHDRAWAL_PER_USER"];
  if (maxDaily) {
    const cap     = parseFloat(maxDaily);
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    if (Number.isFinite(cap)) {
      const dailyAgg = await prisma.withdrawalRequest.aggregate({
        where: {
          userId:     wr.userId,
          id:         { not: wr.id },  // exclude self
          createdAt:  { gte: since24 },
          status:     { notIn: ["FAILED", "REJECTED", "CANCELLED"] },
        },
        _sum: { amount: true },
      });
      const dailyTotal = parseFloat((dailyAgg._sum.amount ?? "0").toString());
      const combined   = dailyTotal + parseFloat(amount.toString());
      if (combined > cap) {
        return {
          reason: `Daily withdrawal total $${combined.toFixed(2)} would exceed per-user risk limit of $${cap.toFixed(2)}`,
          action: "manual_review",
        };
      }
    }
  }

  // 3. Hourly request count cap
  const maxHourly = process.env["MAX_HOURLY_WITHDRAWALS_PER_USER"];
  if (maxHourly) {
    const cap    = parseInt(maxHourly, 10);
    const since1 = new Date(Date.now() - 60 * 60 * 1_000);
    if (Number.isFinite(cap)) {
      const hourlyCount = await prisma.withdrawalRequest.count({
        where: {
          userId:    wr.userId,
          id:        { not: wr.id },  // exclude self
          createdAt: { gte: since1 },
          status:    { notIn: ["FAILED", "REJECTED", "CANCELLED"] },
        },
      });
      if (hourlyCount >= cap) {
        return {
          reason: `Hourly withdrawal count (${hourlyCount + 1}) exceeds per-user risk limit of ${cap} per hour`,
          action: "manual_review",
        };
      }
    }
  }

  void Prisma;
  return null;
}

// ── Processor failure handling ────────────────────────────────────────────────

async function handleProcessorFailure(input: {
  id: string;
  claimToken: string;
  previousStatus: "VALIDATING" | "QUEUED" | "PROCESSING" | "SIGNED" | "BROADCASTING";
  reason: string;
  evidence: ProcessorFailureEvidence;
}): Promise<void> {
  const decision = decideProcessorFailure(input.evidence);
  if (decision.targetStatus === "COMPLETED") return;

  const protectedFailure = decision.targetStatus === "BROADCAST_UNKNOWN";
  const changed = await transitionClaimedWithdrawal(
    input.id,
    input.claimToken,
    [input.previousStatus],
    protectedFailure ? "BROADCAST_UNKNOWN" : "PENDING",
    protectedFailure
      ? {
          broadcastUnknownAt: new Date(),
          broadcastUnknownReason: "Processor failure after the signing/broadcast boundary; blockchain outcome requires reconciliation.",
          failureReason: "No automatic refund was issued; blockchain outcome requires reconciliation.",
        }
      : {
          failureReason: "Automatic processing failed before signing or broadcasting; administrator decision required.",
        },
  );
  if (!changed) return;

  await logWithdrawalEvent(input.id, "PROCESSOR_FAILURE", {
    withdrawalId: input.id,
    previousState: input.previousStatus,
    newState: decision.targetStatus,
    failureClassification: decision.classification,
    reason: protectedFailure
      ? "Processor failure after the signing/broadcast boundary; blockchain outcome requires reconciliation."
      : input.reason,
    safeToRetry: decision.safeToRetry,
  });

  if (protectedFailure) {
    await logWithdrawalEvent(input.id, "BROADCAST_UNKNOWN", {
      reason: "Processor failure after the signing/broadcast boundary; blockchain outcome requires reconciliation.",
    });
  }
}

// ── prepareBlockchainTransfer ─────────────────────────────────────────────────

async function prepareBlockchainTransfer(
  id:     string,
  wr:     { walletAddressSnapshot: string; amount: object; network: "BEP20"; withdrawalId: string | null; idempotencyKey: string },
  logCtx: object,
  claimToken: string,
): Promise<PreparedTransfer | null> {
  if (!isGatewayConfigured(wr.network)) {
    logger.warn({ ...logCtx }, "withdrawal.processor: blockchain gateway not configured — skipping prepareTransfer");
    return null;
  }

  try {
    const gw            = getWithdrawalGateway(wr.network);
    const { Prisma }    = await import("@prisma/client");
    const amountDecimal = wr.amount as import("@prisma/client").Prisma.Decimal;
    const amountStr     = amountDecimal.toFixed(8);
    const withdrawalRef = wr.withdrawalId ?? wr.idempotencyKey;

    logger.info(
      { ...logCtx, to: wr.walletAddressSnapshot, amount: amountStr, dryRun: gw.isDryRun },
      "withdrawal.processor: calling prepareTransfer",
    );

    const prepared = await gw.prepareTransfer(wr.walletAddressSnapshot, amountStr, withdrawalRef);

    await prisma.withdrawalRequest.update({
      where: { id },
      data:  { preparedTxData: prepared as unknown as import("@prisma/client").Prisma.InputJsonValue },
    });

    logger.info(
      {
        ...logCtx,
        estimatedGas:    prepared.estimatedGas,
        gasPriceGwei:    prepared.gasPriceGwei,
        estimatedFeeBnb: prepared.estimatedFeeBnb,
        nonce:           prepared.nonce,
      },
      "withdrawal.processor: prepareTransfer complete",
    );

    void Prisma;
    return prepared;
  } catch (err) {
    logger.error({ ...logCtx, err }, "withdrawal.processor: prepareTransfer failed (non-fatal)");
    return null;
  }
}

// ── signAndBroadcastWithdrawal ────────────────────────────────────────────────

async function signAndBroadcastWithdrawal(
  id:      string,
  wr:      { walletAddressSnapshot: string; amount: object; network: "BEP20"; withdrawalId: string | null; idempotencyKey: string; userId: string },
  prepared: PreparedTransfer | null,
  logCtx:  object,
  claimToken: string,
): Promise<void> {
  const amount = wr.amount as import("@prisma/client").Prisma.Decimal;

  if (!isGatewayConfigured(wr.network)) {
    await releaseDryRunClaim(id, claimToken, "Blockchain gateway is not configured");
    return;
  }

  const gw = getWithdrawalGateway(wr.network);

  if (gw.isDryRun) {
    await releaseDryRunClaim(id, claimToken, "Blockchain dry-run mode is enabled; no live transaction was attempted");
    return;
  }

  if (!await renewWithdrawalClaim(id, claimToken)) {
    logger.warn(
      { ...logCtx },
      "withdrawal.processor: claim lost before signing — skipping",
    );
    return;
  }

  // ── Use stored preparedTxData or prepare fresh ───────────────────────────────
  let preparedTx: PreparedTransfer;

  if (prepared) {
    preparedTx = prepared;
  } else {
    const row = await prisma.withdrawalRequest.findUnique({
      where:  { id },
      select: { preparedTxData: true },
    });

    if (row?.preparedTxData) {
      preparedTx = row.preparedTxData as unknown as PreparedTransfer;
    } else {
      const { Prisma } = await import("@prisma/client");
      const amountStr  = (wr.amount as import("@prisma/client").Prisma.Decimal).toFixed(8);
      void Prisma;
      try {
        preparedTx = await gw.prepareTransfer(
          wr.walletAddressSnapshot,
          amountStr,
          wr.withdrawalId ?? wr.idempotencyKey,
        );
      } catch (err) {
        logger.error({ ...logCtx, err }, "withdrawal.processor: fresh prepareTransfer failed");
        await handleProcessorFailure({
          id,
          claimToken,
          previousStatus: "PROCESSING",
          reason: "Transaction preparation failed before signing or broadcasting.",
          evidence: { status: "PROCESSING", signingOrBroadcastingDidNotOccur: true },
        });
        return;
      }
    }
  }

  // ── Sign + Broadcast ─────────────────────────────────────────────────────────
  logger.info({ ...logCtx }, "withdrawal.processor: beginning sign+broadcast");

  let txHash:      string;
  let signedAt:    Date;
  let broadcastAt: Date;
  let nonce:       number;

  if (!await transitionClaimedWithdrawal(id, claimToken, ["PROCESSING"], "SIGNED", { signedAt: new Date() })) {
    throw new Error("Withdrawal claim lost before SIGNED transition");
  }
  await logWithdrawalEvent(id, "SIGNED");
  logger.info({ ...logCtx, status: "SIGNED" }, "withdrawal.processor: signing started");

  try {
    if (!await transitionClaimedWithdrawal(id, claimToken, ["SIGNED"], "BROADCASTING")) {
      throw new Error("Withdrawal claim lost before BROADCASTING transition");
    }
    await logWithdrawalEvent(id, "BROADCAST");
    logger.info({ ...logCtx, status: "BROADCASTING" }, "withdrawal.processor: broadcasting");

    const result = await gw.signAndBroadcast(preparedTx);
    txHash      = result.txHash;
    signedAt    = result.signedAt;
    broadcastAt = result.broadcastAt;
    nonce       = result.nonce;
  } catch (err) {
    const isSignErr      = err instanceof GatewaySigningError;
    const isBroadcastErr = err instanceof GatewayBroadcastError;
    const msg            = err instanceof Error ? err.message : String(err);

    logger.error({ ...logCtx, err: msg, isSignErr, isBroadcastErr },
      "withdrawal.processor: sign/broadcast failed");

    await handleProcessorFailure({
      id,
      claimToken,
      previousStatus: "BROADCASTING",
      reason: "Signing or broadcasting failed after the protected processing boundary.",
      evidence: {
        status: "BROADCASTING",
        transactionOutcomeAmbiguous: true,
      },
    });
    return;
  }

  // ── txHash received — build explorer URL + deduct balance + CONFIRMING ───────
  const explorerUrl = buildExplorerUrl(txHash);
  logger.info({ ...logCtx, txHash, nonce, explorerUrl }, "withdrawal.processor: txHash received — committing");

  const committed = await prisma.withdrawalRequest.updateMany({
    where: {
      id,
      claimOwner: WITHDRAWAL_WORKER_ID,
      claimToken,
      status: "BROADCASTING",
    },
    data: {
      status: "CONFIRMING",
      txHash,
      explorerUrl,
      signedAt,
      broadcastAt,
      processedAt: broadcastAt,
      claimOwner: null,
      claimToken: null,
      claimExpiresAt: null,
    },
  });
  if (committed.count !== 1) {
    throw new Error("Withdrawal claim lost before CONFIRMING commit");
  }

  await logWithdrawalEvent(id, "CONFIRMING", { txHash, nonce, explorerUrl });

  logger.info(
    { ...logCtx, txHash, nonce, status: "CONFIRMING", explorerUrl },
    "withdrawal.processor: withdrawal confirmed — awaiting on-chain confirmations",
  );
}
