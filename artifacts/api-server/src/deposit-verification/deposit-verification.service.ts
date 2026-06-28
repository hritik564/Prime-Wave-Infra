import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { getAdapter } from "./adapter/adapter-factory";
import { MockBlockchainAdapter } from "./adapter/mock-blockchain-adapter";
import { approveDeposit } from "../admin/admin-deposits.service";
import { eventBus } from "../events/event-bus";
import * as repo from "./deposit-verification.repository";
import type { VerificationRow } from "./deposit-verification.repository";
import type { TxDetails } from "./adapter/blockchain-adapter.interface";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_VERIFICATION_ATTEMPTS = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTerminal(status: string): boolean {
  return ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"].includes(status);
}

async function getPollIntervalMs(): Promise<number> {
  try {
    const setting = await prisma.systemSettings.findUnique({
      where:  { key: "deposit_verification.poll_interval_ms" },
      select: { value: true },
    });
    if (setting) return Math.max(1_000, Number(setting.value));
  } catch { /* fall through */ }
  return 20_000;
}

async function getCompanyWalletAddress(network: string): Promise<string> {
  const wallet = await prisma.companyWallet.findFirst({
    where:   { network: network as Prisma.CompanyWalletWhereInput["network"], isActive: true },
    orderBy: { createdAt: "asc" },
    select:  { walletAddress: true },
  });
  return wallet?.walletAddress ?? MockBlockchainAdapter.COMPANY_WALLET;
}

async function getSuperAdminId(): Promise<string> {
  const admin = await prisma.admin.findFirst({
    where:   { role: "SUPER_ADMIN", isActive: true },
    select:  { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No active SUPER_ADMIN found — cannot auto-approve deposit");
  return admin.id;
}

function nextCheckAt(pollMs: number): Date {
  return new Date(Date.now() + pollMs);
}

// ── Submit ────────────────────────────────────────────────────────────────────

/**
 * Creates a DepositVerification for a submitted transaction hash.
 * The worker picks it up immediately (nextCheckAt = now).
 */
export async function submitVerification(
  userId:  string,
  txHash:  string,
  network: string,
) {
  const existing = await repo.findByTxHash(txHash);
  if (existing) {
    throw new AppError(
      "Transaction hash already submitted — check your verification status",
      HTTP_STATUS.CONFLICT,
      "DUPLICATE_TX_HASH",
    );
  }

  const recipientAddress = await getCompanyWalletAddress(network);
  const requiredConfirmations = MockBlockchainAdapter.REQUIRED_CONFIRMATIONS;

  const verification = await repo.create({
    userId,
    txHash,
    network: network as Prisma.DepositVerificationCreateInput["network"],
    recipientAddress,
    requiredConfirmations,
    nextCheckAt: new Date(),
  });

  logger.info(
    { verificationId: verification.id, userId, txHash, network },
    "DepositVerification: submitted",
  );

  return verification;
}

// ── Status query ──────────────────────────────────────────────────────────────

export async function getVerificationStatus(id: string, userId: string) {
  const v = await repo.findByIdForUser(id, userId);
  if (!v) {
    throw new AppError("Verification not found", HTTP_STATUS.NOT_FOUND, "VERIFICATION_NOT_FOUND");
  }
  return v;
}

// ── Worker entry point ────────────────────────────────────────────────────────

/**
 * Processes all pending verifications due for a check.
 * Called by the worker on each polling interval.
 * Returns the number of records processed.
 */
export async function processPendingVerifications(): Promise<number> {
  const now     = new Date();
  const pending = await repo.findPendingForWorker(now);

  if (pending.length === 0) return 0;

  const pollMs = await getPollIntervalMs();

  await Promise.allSettled(
    pending.map((v) => processOne(v, pollMs).catch((err) =>
      logger.error({ err, verificationId: v.id }, "DepositVerification: unhandled error"),
    )),
  );

  return pending.length;
}

// ── Core verification logic ───────────────────────────────────────────────────

async function processOne(v: VerificationRow, pollMs: number): Promise<void> {
  if (isTerminal(v.verificationStatus)) return;

  const now     = new Date();
  const adapter = getAdapter(v.network);

  // TX_SUBMITTED → VERIFYING on first pickup
  if (v.verificationStatus === "TX_SUBMITTED") {
    await repo.transition(v.id, "VERIFYING", {
      firstSeenAt:         now,
      verificationAttempts: 0,
      nextCheckAt:         now,
    });
  }

  const newAttempts = v.verificationAttempts + 1;

  // Expire after too many attempts
  if (newAttempts > MAX_VERIFICATION_ATTEMPTS) {
    await repo.transition(v.id, "EXPIRED", {
      failureReason:        `Timed out after ${newAttempts} attempts`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    });
    logger.warn({ verificationId: v.id, txHash: v.txHash }, "DepositVerification: EXPIRED");
    return;
  }

  // Call blockchain adapter
  let adapterResult;
  try {
    adapterResult = await adapter.verifyTransaction(v.txHash, v.recipientAddress ?? undefined);
  } catch (err) {
    await repo.transition(v.id, "VERIFYING", {
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
      nextCheckAt:          nextCheckAt(pollMs),
    });
    logger.warn({ err, verificationId: v.id }, "DepositVerification: adapter error, will retry");
    return;
  }

  // TX not found yet — keep VERIFYING
  if (!adapterResult.found) {
    await repo.transition(v.id, "VERIFYING", {
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
      nextCheckAt:          nextCheckAt(pollMs),
    });
    return;
  }

  const details = adapterResult.details;

  // ── Validate TX ───────────────────────────────────────────────────────────

  if (!details.success) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        "Blockchain transaction reverted or failed on-chain",
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    });
    return;
  }

  if (details.network !== v.network) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        `Wrong network: expected ${v.network}, got ${details.network}`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    });
    return;
  }

  if (details.recipientAddress.toLowerCase() !== v.recipientAddress.toLowerCase()) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        `Wrong recipient — funds sent to ${details.recipientAddress}`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    });
    return;
  }

  // ── Update with blockchain data ───────────────────────────────────────────

  const blockchainUpdate = {
    senderAddress:        details.senderAddress,
    tokenContract:        details.tokenContract,
    blockchainAmount:     details.amount,
    confirmations:        details.confirmations,
    firstSeenAt:          v.firstSeenAt ?? now,
    verificationAttempts: newAttempts,
    lastCheckedAt:        now,
  };

  // ── Waiting for confirmations ─────────────────────────────────────────────

  if (details.confirmations < v.requiredConfirmations) {
    await repo.transition(v.id, "WAITING_CONFIRMATIONS", {
      ...blockchainUpdate,
      nextCheckAt: nextCheckAt(pollMs),
    });
    logger.info(
      { verificationId: v.id, confirmations: details.confirmations, required: v.requiredConfirmations },
      "DepositVerification: WAITING_CONFIRMATIONS",
    );
    return;
  }

  // ── CONFIRMED ─────────────────────────────────────────────────────────────

  const confirmedAt = new Date();
  await repo.transition(v.id, "CONFIRMED", { ...blockchainUpdate, confirmedAt });

  logger.info({ verificationId: v.id, txHash: v.txHash }, "DepositVerification: CONFIRMED — crediting wallet");

  // ── Credit wallet (reuses exact manual-approval pipeline) ────────────────

  await creditVerifiedDeposit(v, details, confirmedAt);
}

// ── Credit wallet — reuses approveDeposit() pipeline ─────────────────────────
//
// Regression guarantee (Amendment 6): approveDeposit() is called unchanged.
// Both auto and manual flows produce identical wallet credit, ledger entries,
// notifications, and audit logs after approveDeposit() returns.

async function creditVerifiedDeposit(
  v:           VerificationRow,
  details:     TxDetails,
  confirmedAt: Date,
): Promise<void> {
  try {
    const superAdminId = await getSuperAdminId();

    // Create DepositRequest directly via Prisma (bypass manual validation rules).
    // Amount comes from blockchain adapter — not user-entered.
    const depositRequest = await prisma.depositRequest.create({
      data: {
        userId:        v.userId,
        amount:        details.amount,
        network:       v.network,
        txHash:        v.txHash,
        companyWallet: v.recipientAddress,
        status:        "PENDING",
      },
      select: { id: true },
    });

    // Link the DepositRequest to the verification record
    await repo.linkDeposit(v.id, depositRequest.id);

    // Admin audit log for auto-verification event (before approveDeposit adds its own)
    await prisma.adminLog.create({
      data: {
        adminId:      superAdminId,
        action:       "DEPOSIT_AUTO_VERIFIED",
        targetUserId: v.userId,
        details: {
          verificationId: v.id,
          depositId:      depositRequest.id,
          txHash:         v.txHash,
          network:        v.network,
          amount:         details.amount.toFixed(8),
          confirmations:  details.confirmations,
          approvalMode:   "AUTOMATIC",
        },
      },
    });

    // Reuse the exact same production-tested approval pipeline
    await approveDeposit(superAdminId, depositRequest.id);

    // Transition: CONFIRMED → CREDITED → COMPLETED
    const creditedAt   = new Date();
    const completedAt  = new Date();

    await repo.transition(v.id, "CREDITED",   { creditedAt });
    await repo.transition(v.id, "COMPLETED",  { completedAt });

    // Domain event — future modules subscribe without touching this service
    eventBus.emitDepositVerified({
      verificationId: v.id,
      depositId:      depositRequest.id,
      userId:         v.userId,
      amount:         details.amount.toFixed(8),
      network:        v.network,
      txHash:         v.txHash,
      creditedAt,
    });

    logger.info(
      { verificationId: v.id, depositId: depositRequest.id, amount: details.amount.toFixed(2) },
      "DepositVerification: COMPLETED — wallet credited",
    );
  } catch (err) {
    logger.error({ err, verificationId: v.id }, "DepositVerification: credit failed — transitioning to FAILED");
    await repo.transition(v.id, "FAILED", {
      failureReason: err instanceof Error ? err.message : "Credit pipeline failed",
    }).catch(() => { /* best effort */ });
  }
}
