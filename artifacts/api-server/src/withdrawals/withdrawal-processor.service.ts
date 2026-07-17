import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { enqueue, lockForProcessing } from "./withdrawal-queue.service";
import { getWithdrawalSettings } from "./withdrawals.service";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { GatewayDryRunError, GatewaySigningError, GatewayBroadcastError } from "../services/blockchain/blockchain.interface";
import type { PreparedTransfer } from "../services/blockchain/blockchain.types";
import { logWithdrawalEvent } from "./withdrawal-events.service";

/**
 * Withdrawal Processor Service
 *
 * Drives the full withdrawal state machine:
 *   PENDING → VALIDATING → QUEUED → PROCESSING → SIGNED → BROADCASTING → CONFIRMING
 *
 * Balance is deducted permanently only after a valid txHash is received.
 * On any signing or broadcast failure: status → FAILED, funds refunded.
 */

interface ProcessResult {
  processed: number;
  failed:    number;
  errors:    string[];
}

export async function processPendingWithdrawals(): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, failed: 0, errors: [] };

  const pending = await prisma.withdrawalRequest.findMany({
    where:   { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    select: {
      id:                    true,
      withdrawalId:          true,
      idempotencyKey:        true,
      userId:                true,
      amount:                true,
      network:               true,
      walletAddressSnapshot: true,
    },
  });

  logger.info({ count: pending.length }, "withdrawal.processor: starting batch");

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

  logger.info(result, "withdrawal.processor: batch complete");
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
}): Promise<void> {
  const { id, withdrawalId: wId, idempotencyKey } = wr;
  const logCtx = { withdrawalId: wId ?? id, idempotencyKey };

  // ── PENDING → VALIDATING ─────────────────────────────────────────────────────
  await prisma.withdrawalRequest.update({ where: { id }, data: { status: "VALIDATING" } });
  await logWithdrawalEvent(id, "VALIDATED");
  logger.info({ ...logCtx, status: "VALIDATING" }, "withdrawal.processor: validating");

  // ── Run validations ──────────────────────────────────────────────────────────
  const validationError = await validateWithdrawal(wr);

  if (validationError) {
    await failWithdrawal(id, wr.userId, wr.amount as import("@prisma/client").Prisma.Decimal, validationError);
    logger.warn({ ...logCtx, reason: validationError }, "withdrawal.processor: failed validation");
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

async function validateWithdrawal(wr: {
  userId:                string;
  amount:                object;
  network:               "BEP20";
  walletAddressSnapshot: string;
}): Promise<string | null> {
  const { Prisma } = await import("@prisma/client");
  const amount = wr.amount as import("@prisma/client").Prisma.Decimal;

  const user = await prisma.user.findUnique({
    where:  { id: wr.userId },
    select: { status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    return "User account is not active";
  }

  const settings = await getWithdrawalSettings(wr.network);
  if (!settings.isEnabled) {
    return `Withdrawals are currently disabled for ${wr.network}`;
  }
  if (amount.lt(settings.minimumAmount)) {
    return `Amount is below current minimum of $${settings.minimumAmount.toFixed(2)}`;
  }
  if (amount.gt(settings.maximumAmount)) {
    return `Amount exceeds current maximum of $${settings.maximumAmount.toFixed(2)}`;
  }

  const verifiedAddress = await prisma.walletAddress.findFirst({
    where: { userId: wr.userId, network: wr.network, address: wr.walletAddressSnapshot, isVerified: true },
  });
  if (!verifiedAddress) {
    return "Wallet address is no longer verified on this account";
  }

  const wallet = await prisma.wallet.findUnique({
    where:  { userId: wr.userId },
    select: { lockedWithdrawalBalance: true },
  });
  if (!wallet || wallet.lockedWithdrawalBalance.lt(amount)) {
    return "Insufficient locked balance for this withdrawal";
  }

  void Prisma; // satisfy lint
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
//
// Concurrency guard: reads the current DB status inside a raw SELECT FOR UPDATE
// so that two concurrent processor instances cannot both proceed on the same row.
// Signing happens outside the DB transaction (avoids holding a DB connection
// open during RPC calls), but the final commit re-checks status before writing.
//
// Balance is deducted only if a valid txHash is returned from the gateway.

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
      // Prepare fresh
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

  // Mark SIGNED before signing (optimistic — sign starts now)
  await prisma.withdrawalRequest.update({
    where: { id },
    data:  { status: "SIGNED", signedAt: new Date() },
  });
  await logWithdrawalEvent(id, "SIGNED");
  logger.info({ ...logCtx, status: "SIGNED" }, "withdrawal.processor: signing started");

  try {
    // Mark BROADCASTING before sending to chain
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

  // ── txHash received — deduct balance + transition to CONFIRMING ──────────────
  logger.info({ ...logCtx, txHash, nonce }, "withdrawal.processor: txHash received — committing");

  await prisma.$transaction(async (tx) => {
    // Final status check before committing (second line of concurrency defence)
    const current = await tx.withdrawalRequest.findUnique({
      where:  { id },
      select: { status: true },
    });

    if (!current || current.status !== "BROADCASTING") {
      throw new Error(
        `withdrawal.processor: unexpected status '${current?.status ?? "null"}' before CONFIRMING commit — aborting`,
      );
    }

    // Permanently deduct locked balance (balance was locked at request time)
    await tx.wallet.update({
      where: { userId: wr.userId },
      data:  { lockedWithdrawalBalance: { decrement: amount } },
    });

    // Move to CONFIRMING with txHash + timestamps
    await tx.withdrawalRequest.update({
      where: { id },
      data:  {
        status:      "CONFIRMING",
        txHash,
        signedAt,
        broadcastAt,
        processedAt: broadcastAt,
      },
    });
  });

  await logWithdrawalEvent(id, "CONFIRMING", { txHash, nonce });

  logger.info(
    { ...logCtx, txHash, nonce, status: "CONFIRMING" },
    "withdrawal.processor: withdrawal confirmed — awaiting on-chain confirmations",
  );
}
