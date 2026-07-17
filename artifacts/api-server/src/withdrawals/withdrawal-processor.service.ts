import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { enqueue, lockForProcessing } from "./withdrawal-queue.service";
import { getWithdrawalSettings } from "./withdrawals.service";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";

/**
 * Withdrawal Processor Service
 *
 * Drives the state machine for the non-blockchain portion of the pipeline:
 *   PENDING → VALIDATING → QUEUED → PROCESSING
 *
 * Does NOT interact with blockchain, RPC nodes, or private keys.
 */

interface ProcessResult {
  processed:  number;
  failed:     number;
  errors:     string[];
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
  id:     string;
  withdrawalId: string | null;
  userId: string;
  amount: object;
  network: "BEP20";
  walletAddressSnapshot: string;
  idempotencyKey: string;
}): Promise<void> {
  const { id, withdrawalId: wId, idempotencyKey } = wr;
  const logCtx = { withdrawalId: wId ?? id, idempotencyKey };

  // ── PENDING → VALIDATING ────────────────────────────────────────────────────
  await prisma.withdrawalRequest.update({ where: { id }, data: { status: "VALIDATING" } });
  logger.info({ ...logCtx, status: "VALIDATING" }, "withdrawal.processor: validating");

  // ── Run validations ─────────────────────────────────────────────────────────
  const validationError = await validateWithdrawal(wr);

  if (validationError) {
    await failWithdrawal(id, wr.userId, wr.amount as import("@prisma/client").Prisma.Decimal, validationError);
    logger.warn({ ...logCtx, reason: validationError }, "withdrawal.processor: failed validation");
    return;
  }

  // ── VALIDATING → QUEUED ──────────────────────────────────────────────────────
  await enqueue(id);

  // ── QUEUED → PROCESSING ──────────────────────────────────────────────────────
  await lockForProcessing(id);
  logger.info({ ...logCtx, status: "PROCESSING" }, "withdrawal.processor: reached PROCESSING");

  // ── Call blockchain gateway: prepareTransfer (dry run) ─────────────────────
  await prepareBlockchainTransfer(id, wr, logCtx);
}

async function validateWithdrawal(wr: {
  userId: string;
  amount: object;
  network: "BEP20";
  walletAddressSnapshot: string;
}): Promise<string | null> {
  const { Prisma } = await import("@prisma/client");
  const amount = wr.amount as import("@prisma/client").Prisma.Decimal;

  // 1. Check user status
  const user = await prisma.user.findUnique({
    where:  { id: wr.userId },
    select: { status: true },
  });
  if (!user || user.status !== "ACTIVE") {
    return "User account is not active";
  }

  // 2. Check withdrawal settings still enabled + amount still valid
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

  // 3. Check user still has a verified wallet address matching the snapshot
  const verifiedAddress = await prisma.walletAddress.findFirst({
    where: { userId: wr.userId, network: wr.network, address: wr.walletAddressSnapshot, isVerified: true },
  });
  if (!verifiedAddress) {
    return "Wallet address is no longer verified on this account";
  }

  // 4. Re-check wallet balance (funds should still be locked)
  const wallet = await prisma.wallet.findUnique({
    where:  { userId: wr.userId },
    select: { lockedWithdrawalBalance: true },
  });
  if (!wallet || wallet.lockedWithdrawalBalance.lt(amount)) {
    return "Insufficient locked balance for this withdrawal";
  }

  return null;
}

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
  logger.info({ withdrawalId: id, failureReason }, "withdrawal.processor: withdrawal failed, funds refunded");
}

// ── Blockchain gateway integration ────────────────────────────────────────────
//
// In Sprint 31B this is DRY RUN only — prepareTransfer returns unsigned calldata
// and stores it in preparedTxData. No signing, no broadcasting, no balance changes.

async function prepareBlockchainTransfer(
  id:      string,
  wr:      { walletAddressSnapshot: string; amount: object; network: "BEP20"; withdrawalId: string | null; idempotencyKey: string },
  logCtx:  object,
): Promise<void> {
  if (!isGatewayConfigured(wr.network)) {
    logger.warn(
      { ...logCtx },
      "withdrawal.processor: blockchain gateway not configured — skipping prepareTransfer (DRY RUN placeholder)",
    );
    return;
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

    // Store the prepared transaction data for audit / Sprint 31C signing
    await prisma.withdrawalRequest.update({
      where: { id },
      data: {
        preparedTxData: prepared as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    logger.info(
      {
        ...logCtx,
        estimatedGas:    prepared.estimatedGas,
        gasPriceGwei:    prepared.gasPriceGwei,
        estimatedFeeBnb: prepared.estimatedFeeBnb,
        nonce:           prepared.nonce,
        dryRun:          prepared.dryRun,
      },
      "withdrawal.processor: prepareTransfer complete (DRY RUN — awaiting Sprint 31C for broadcast)",
    );

    void Prisma; // satisfy lint
  } catch (err) {
    // Do NOT fail the withdrawal — blockchain prep failure is non-fatal in dry run
    logger.error(
      { ...logCtx, err },
      "withdrawal.processor: prepareTransfer failed (non-fatal in DRY RUN — withdrawal stays PROCESSING)",
    );
  }
}
