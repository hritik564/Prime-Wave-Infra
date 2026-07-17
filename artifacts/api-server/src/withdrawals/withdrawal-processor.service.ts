import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { enqueue, lockForProcessing } from "./withdrawal-queue.service";
import { getWithdrawalSettings } from "./withdrawals.service";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { GatewaySigningError, GatewayBroadcastError } from "../services/blockchain/blockchain.interface";
import type { PreparedTransfer } from "../services/blockchain/blockchain.types";
import { logWithdrawalEvent } from "./withdrawal-events.service";
import { moveToManualReview } from "./withdrawal-confirmation.service";
import { isWithdrawalEngineEnabled } from "./withdrawal-engine.service";
import { checkHotWalletStatus } from "./withdrawal-hot-wallet.service";
import { buildExplorerUrl } from "./withdrawal-hot-wallet.service";

/**
 * Withdrawal Processor Service — Sprint 31E
 *
 * Added operational controls:
 *   1. Engine switch  — skip entire batch if engine is disabled
 *   2. Hot wallet guard — skip batch if BNB or USDT is below minimum thresholds
 *   3. Hold period    — ignore PENDING withdrawals younger than WITHDRAWAL_HOLD_MINUTES
 *   4. Risk limits    — large / high-frequency withdrawals → MANUAL_REVIEW (no refund)
 *
 * Core state machine remains: PENDING → VALIDATING → QUEUED → PROCESSING →
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

  const pending = await prisma.withdrawalRequest.findMany({
    where:   {
      status:      "PENDING",
      requestedAt: { lte: holdCutoff }, // Only pick up requests past the hold window
    },
    orderBy: { requestedAt: "asc" },
    select: {
      id:                    true,
      withdrawalId:          true,
      idempotencyKey:        true,
      userId:                true,
      amount:                true,
      network:               true,
      walletAddressSnapshot: true,
      requestedAt:           true,
    },
  });

  const waitingCount = await prisma.withdrawalRequest.count({
    where: { status: "PENDING", requestedAt: { gt: holdCutoff } },
  });

  logger.info(
    { count: pending.length, waiting: waitingCount, holdMinutes },
    "withdrawal.processor: starting batch",
  );

  for (const wr of pending) {
    try {
      await runSingleWithdrawal(wr as typeof wr & { idempotencyKey: string });
      result.processed++;
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${wr.withdrawalId ?? wr.id}: ${msg}`);
      logger.error({ withdrawalId: wr.id, err }, "withdrawal.processor: error processing withdrawal");
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
}): Promise<void> {
  const { id, withdrawalId: wId, idempotencyKey } = wr;
  const logCtx = { withdrawalId: wId ?? id, idempotencyKey };

  // ── PENDING → VALIDATING ─────────────────────────────────────────────────────
  await prisma.withdrawalRequest.update({ where: { id }, data: { status: "VALIDATING" } });
  await logWithdrawalEvent(id, "VALIDATED");
  logger.info({ ...logCtx, status: "VALIDATING" }, "withdrawal.processor: validating");

  // ── Run validations ──────────────────────────────────────────────────────────
  const validation = await validateWithdrawal(wr);

  if (validation) {
    if (validation.action === "manual_review") {
      await moveToManualReview(id, validation.reason);
      logger.warn({ ...logCtx, reason: validation.reason }, "withdrawal.processor: risk limit → MANUAL_REVIEW");
    } else {
      await failWithdrawal(id, wr.userId, wr.amount as import("@prisma/client").Prisma.Decimal, validation.reason);
      logger.warn({ ...logCtx, reason: validation.reason }, "withdrawal.processor: failed validation");
    }
    return;
  }

  // ── VALIDATING → QUEUED ──────────────────────────────────────────────────────
  await enqueue(id);
  await logWithdrawalEvent(id, "QUEUED");

  // ── QUEUED → PROCESSING ──────────────────────────────────────────────────────
  await lockForProcessing(id);
  await logWithdrawalEvent(id, "PROCESSING");
  logger.info({ ...logCtx, status: "PROCESSING" }, "withdrawal.processor: reached PROCESSING");

  // ── Prepare transaction ──────────────────────────────────────────────────────
  const prepared = await prepareBlockchainTransfer(id, wr, logCtx);

  // ── Sign + broadcast ─────────────────────────────────────────────────────────
  await signAndBroadcastWithdrawal(id, wr, prepared, logCtx);
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

// ── failWithdrawal ────────────────────────────────────────────────────────────

async function failWithdrawal(
  id:            string,
  userId:        string,
  amount:        import("@prisma/client").Prisma.Decimal,
  failureReason: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id },
      data:  { status: "FAILED", failureReason },
    });
    await tx.wallet.update({
      where: { userId },
      data:  {
        withdrawalWallet:        { increment: amount },
        lockedWithdrawalBalance: { decrement: amount },
      },
    });
  });
  await logWithdrawalEvent(id, "FAILED", { failureReason });
  await logWithdrawalEvent(id, "REFUNDED", { amount: amount.toFixed(8) });
  logger.info({ withdrawalId: id, failureReason }, "withdrawal.processor: withdrawal failed, funds refunded");
}

// ── prepareBlockchainTransfer ─────────────────────────────────────────────────

async function prepareBlockchainTransfer(
  id:     string,
  wr:     { walletAddressSnapshot: string; amount: object; network: "BEP20"; withdrawalId: string | null; idempotencyKey: string },
  logCtx: object,
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
): Promise<void> {
  const amount = wr.amount as import("@prisma/client").Prisma.Decimal;

  if (!isGatewayConfigured(wr.network)) {
    logger.info({ ...logCtx }, "withdrawal.processor: gateway not configured — leaving as PROCESSING");
    return;
  }

  const gw = getWithdrawalGateway(wr.network);

  if (gw.isDryRun) {
    logger.info({ ...logCtx }, "withdrawal.processor: dry-run mode — skipping sign+broadcast");
    return;
  }

  // ── Concurrency guard: SELECT FOR UPDATE ─────────────────────────────────────
  const locked = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM withdrawal_requests WHERE id = ${id} FOR UPDATE
  `;

  if (!locked[0] || locked[0].status !== "PROCESSING") {
    logger.warn(
      { ...logCtx, currentStatus: locked[0]?.status },
      "withdrawal.processor: concurrency guard — withdrawal no longer PROCESSING, skipping",
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
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ ...logCtx, err }, "withdrawal.processor: fresh prepareTransfer failed");
        await failWithdrawal(id, wr.userId, amount, `Transaction preparation failed: ${msg}`);
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

  await prisma.withdrawalRequest.update({
    where: { id },
    data:  { status: "SIGNED", signedAt: new Date() },
  });
  await logWithdrawalEvent(id, "SIGNED");
  logger.info({ ...logCtx, status: "SIGNED" }, "withdrawal.processor: signing started");

  try {
    await prisma.withdrawalRequest.update({
      where: { id },
      data:  { status: "BROADCASTING" },
    });
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

    logger.error(
      { ...logCtx, err: msg, isSignErr, isBroadcastErr },
      "withdrawal.processor: sign/broadcast failed — marking FAILED and refunding",
    );

    await failWithdrawal(id, wr.userId, amount, msg);
    return;
  }

  // ── txHash received — build explorer URL + deduct balance + CONFIRMING ───────
  const explorerUrl = buildExplorerUrl(txHash);
  logger.info({ ...logCtx, txHash, nonce, explorerUrl }, "withdrawal.processor: txHash received — committing");

  await prisma.$transaction(async (tx) => {
    const current = await tx.withdrawalRequest.findUnique({
      where:  { id },
      select: { status: true },
    });

    if (!current || current.status !== "BROADCASTING") {
      throw new Error(
        `withdrawal.processor: unexpected status '${current?.status ?? "null"}' before CONFIRMING commit — aborting`,
      );
    }

    await tx.wallet.update({
      where: { userId: wr.userId },
      data:  { lockedWithdrawalBalance: { decrement: amount } },
    });

    await tx.withdrawalRequest.update({
      where: { id },
      data:  {
        status:      "CONFIRMING",
        txHash,
        explorerUrl,
        signedAt,
        broadcastAt,
        processedAt: broadcastAt,
      },
    });
  });

  await logWithdrawalEvent(id, "CONFIRMING", { txHash, nonce, explorerUrl });

  logger.info(
    { ...logCtx, txHash, nonce, status: "CONFIRMING", explorerUrl },
    "withdrawal.processor: withdrawal confirmed — awaiting on-chain confirmations",
  );
}
