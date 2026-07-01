import { Prisma, type DepositNetwork } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { getAdapter } from "./adapter/adapter-factory";
import { approveDeposit } from "../admin/admin-deposits.service";
import { eventBus } from "../events/event-bus";
import { notificationService } from "../notifications/notifications.service";
import * as repo from "./deposit-verification.repository";
import type { VerificationRow } from "./deposit-verification.repository";
import type { TickStats } from "./deposit-verification.metrics";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Result code returned by processOne() for metrics collection.
 *   completed — deposit fully credited and marked COMPLETED
 *   failed    — terminal failure (bad TX, credit error, etc.)
 *   expired   — timed out before sufficient confirmations (legacy EXPIRED records only)
 *   skipped   — optimistic lock lost; another worker already transitioned this row
 *   active    — TX not yet confirmed (or delayed); will be re-checked next tick
 */
export type ProcessResult = "completed" | "failed" | "expired" | "skipped" | "active";

// ── Active status set used as fromStatuses in all optimistic-lock transitions ─
// VERIFICATION_DELAYED is active — worker continues slow-polling these records.

const ACTIVE_VS = [
  "TX_SUBMITTED",
  "VERIFYING",
  "WAITING_CONFIRMATIONS",
  "VERIFICATION_DELAYED",
] as const;

// ── Worker settings ───────────────────────────────────────────────────────────

interface WorkerSettings {
  pollMs:            number;  // normal poll interval (VERIFYING / WAITING_CONFIRMATIONS)
  concurrencyLimit:  number;
  delayThresholdMs:  number;  // age at which VERIFYING → VERIFICATION_DELAYED
  delayedPollMs:     number;  // poll interval while VERIFICATION_DELAYED (slow-poll)
}

async function getWorkerSettings(): Promise<WorkerSettings> {
  try {
    const rows = await prisma.systemSettings.findMany({
      where: {
        key: {
          in: [
            "deposit_verification.poll_interval_ms",
            "deposit_verification.concurrency_limit",
            "deposit_verification.delay_threshold_ms",
            "deposit_verification.delayed_poll_interval_ms",
          ],
        },
      },
      select: { key: true, value: true },
    });
    const m = new Map(rows.map((r) => [r.key, Number(r.value)]));
    return {
      pollMs:           Math.max(1_000,  isFinite(m.get("deposit_verification.poll_interval_ms")         ?? NaN) ? m.get("deposit_verification.poll_interval_ms")!         : 20_000),
      concurrencyLimit: Math.max(1, Math.min(50, isFinite(m.get("deposit_verification.concurrency_limit") ?? NaN) ? m.get("deposit_verification.concurrency_limit")! : 10)),
      delayThresholdMs: Math.max(60_000, isFinite(m.get("deposit_verification.delay_threshold_ms")        ?? NaN) ? m.get("deposit_verification.delay_threshold_ms")!        : 1_800_000),
      delayedPollMs:    Math.max(60_000, isFinite(m.get("deposit_verification.delayed_poll_interval_ms")  ?? NaN) ? m.get("deposit_verification.delayed_poll_interval_ms")!  : 300_000),
    };
  } catch {
    return { pollMs: 20_000, concurrencyLimit: 10, delayThresholdMs: 1_800_000, delayedPollMs: 300_000 };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTerminal(status: string): boolean {
  return ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"].includes(status);
}

/**
 * Returns the poll interval to use for nextCheckAt based on the current status.
 * VERIFICATION_DELAYED records use the slow-poll interval; all others use normal.
 */
function activePollMs(status: string, pollMs: number, delayedPollMs: number): number {
  return status === "VERIFICATION_DELAYED" ? delayedPollMs : pollMs;
}

/**
 * Returns true when address matches the canonical format for the given network.
 * Any string that does not match is treated as a placeholder / unconfigured value.
 *
 *   BEP20 / ERC20 : 0x + 40 hex chars (case-insensitive)
 *   TRC20          : T  + 33 base58 chars
 *   SOL            : 32-44 base58 chars
 */
function isValidWalletFormat(address: string, network: string): boolean {
  switch (network) {
    case "BEP20":
    case "ERC20":
      return /^0x[0-9a-fA-F]{40}$/.test(address);
    case "TRC20":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
    case "SOL":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    default:
      return false;
  }
}

/**
 * Fetch the active company wallet for the given network from the database.
 * Throws if none is configured — a configuration error that must be surfaced.
 * Used internally by creditVerifiedDeposit (non-validating path).
 */
async function getCompanyWalletAddress(network: string): Promise<string> {
  const wallet = await prisma.companyWallet.findFirst({
    where:   { network: network as Prisma.CompanyWalletWhereInput["network"], isActive: true },
    orderBy: { createdAt: "asc" },
    select:  { walletAddress: true },
  });
  if (!wallet) {
    throw new AppError(
      `No active company wallet configured for network ${network}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "NO_COMPANY_WALLET",
    );
  }
  return wallet.walletAddress;
}

/**
 * Validates and fetches the active company wallet before a new submission.
 *
 * Enforces:
 *   • exactly one active wallet for the network
 *   • address format is valid (not a placeholder)
 *
 * Throws HTTP 503 (not 500) so callers receive a user-visible error without
 * leaking configuration details.
 */
async function getValidatedCompanyWalletAddress(network: string): Promise<string> {
  const wallets = await prisma.companyWallet.findMany({
    where:  { network: network as Prisma.CompanyWalletWhereInput["network"], isActive: true },
    select: { walletAddress: true },
  });

  if (wallets.length === 0) {
    logger.error({ network }, "submitVerification: no active company wallet configured");
    throw new AppError(
      "Deposit verification is temporarily unavailable due to server configuration.",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "WALLET_CONFIG_ERROR",
    );
  }

  if (wallets.length > 1) {
    logger.error({ network, count: wallets.length }, "submitVerification: multiple active wallets for network");
    throw new AppError(
      "Deposit verification is temporarily unavailable due to server configuration.",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "WALLET_CONFIG_ERROR",
    );
  }

  const address = wallets[0].walletAddress;

  if (!isValidWalletFormat(address, network)) {
    logger.error({ network, address }, "submitVerification: wallet address is invalid or placeholder");
    throw new AppError(
      "Deposit verification is temporarily unavailable due to server configuration.",
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "WALLET_CONFIG_ERROR",
    );
  }

  return address;
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

// ── Concurrency control ───────────────────────────────────────────────────────

async function runWithConcurrency(
  items:  VerificationRow[],
  limit:  number,
  fn:     (item: VerificationRow) => Promise<ProcessResult>,
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  const queue   = [...items];

  const slot = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      results.push(await fn(item));
    }
  };

  await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, slot),
  );

  return results;
}

// ── Submit ────────────────────────────────────────────────────────────────────

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

  const recipientAddress = await getValidatedCompanyWalletAddress(network);

  const adapter               = getAdapter(network as DepositNetwork);
  const requiredConfirmations = adapter.requiredConfirmations;

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

// ── User history query ────────────────────────────────────────────────────────

export async function getUserVerificationHistory(userId: string, params: { page: number; limit: number }) {
  return repo.findAllForUser(userId, params);
}

// ── Manual admin approval ─────────────────────────────────────────────────────

export async function manualApproveVerification(
  adminId:      string,
  id:           string,
  creditAmount: string,
  reason:       string,
  ip?:          string,
) {
  const v = await repo.findById(id);
  if (!v) {
    throw new AppError("Verification not found", HTTP_STATUS.NOT_FOUND, "VERIFICATION_NOT_FOUND");
  }

  // ── Duplicate protection (HTTP 409) ───────────────────────────────────────

  if (v.verificationStatus === "COMPLETED" || v.verificationStatus === "CREDITED") {
    throw new AppError(
      `Cannot manually credit a ${v.verificationStatus} verification — funds have already been credited`,
      HTTP_STATUS.CONFLICT,
      "ALREADY_CREDITED",
    );
  }

  if (v.verificationStatus === "REJECTED") {
    throw new AppError(
      "Cannot manually credit a REJECTED verification",
      HTTP_STATUS.CONFLICT,
      "VERIFICATION_REJECTED",
    );
  }

  const creditDecimal = new Prisma.Decimal(creditAmount);

  // ── Find or create DepositRequest with the admin-specified amount ──────────

  let depositRequest: { id: string; status: string } | null =
    await prisma.depositRequest.findUnique({
      where:  { txHash: v.txHash },
      select: { id: true, status: true },
    });

  if (depositRequest) {
    if (depositRequest.status === "APPROVED") {
      throw new AppError(
        "This deposit has already been approved and credited",
        HTTP_STATUS.CONFLICT,
        "ALREADY_APPROVED",
      );
    }
    // Existing PENDING or CONFIRMING — update to the admin-specified credit amount
    // so that approveDeposit (which re-reads deposit.amount) uses the correct value.
    await prisma.depositRequest.update({
      where: { id: depositRequest.id },
      data:  { amount: creditDecimal },
    });
  } else {
    try {
      depositRequest = await prisma.depositRequest.create({
        data: {
          userId:        v.userId,
          amount:        creditDecimal,
          network:       v.network,
          txHash:        v.txHash,
          companyWallet: v.recipientAddress,
          status:        "PENDING",
        },
        select: { id: true, status: true },
      });
      await repo.linkDeposit(v.id, depositRequest.id);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // Concurrent creation — re-fetch and check
        depositRequest = await prisma.depositRequest.findUnique({
          where:  { txHash: v.txHash },
          select: { id: true, status: true },
        });
        if (!depositRequest) throw e;
        if (depositRequest.status === "APPROVED") {
          throw new AppError(
            "This deposit has already been approved and credited",
            HTTP_STATUS.CONFLICT,
            "ALREADY_APPROVED",
          );
        }
        await prisma.depositRequest.update({
          where: { id: depositRequest.id },
          data:  { amount: creditDecimal },
        });
      } else {
        throw e;
      }
    }
  }

  // ── Credit via existing approveDeposit pipeline (no duplication) ──────────

  await approveDeposit(adminId, depositRequest.id);

  // ── Transition verification to COMPLETED ──────────────────────────────────

  const now = new Date();
  await prisma.depositVerification.update({
    where: { id: v.id },
    data:  {
      verificationStatus: "COMPLETED",
      creditedAt:         now,
      completedAt:        now,
      confirmedAt:        v.confirmedAt ?? now,
    },
  });

  // ── Compute difference for audit ──────────────────────────────────────────

  const difference = v.blockchainAmount
    ? v.blockchainAmount.minus(creditDecimal).toFixed(8)
    : null;

  // ── Audit log — DEPOSIT_MANUALLY_CREDITED ─────────────────────────────────

  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action:       "DEPOSIT_MANUALLY_CREDITED",
        targetUserId: v.userId,
        details: {
          verificationId:   v.id,
          depositRequestId: depositRequest.id,
          blockchainAmount: v.blockchainAmount?.toFixed(8) ?? null,
          creditedAmount:   creditDecimal.toFixed(8),
          difference,
          reason,
          previousStatus:   v.verificationStatus,
          txHash:           v.txHash,
          network:          v.network,
          ...(ip && { ipAddress: ip }),
          timestamp:        now.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (auditErr) {
    logger.warn({ auditErr, verificationId: id }, "DepositVerification: manual-credit audit log failed (non-fatal)");
  }

  logger.info(
    {
      verificationId:   id,
      adminId,
      previousStatus:   v.verificationStatus,
      creditedAmount:   creditDecimal.toFixed(8),
      blockchainAmount: v.blockchainAmount?.toFixed(8) ?? null,
    },
    "DepositVerification: MANUALLY CREDITED",
  );

  return {
    verificationId:   v.id,
    depositRequestId: depositRequest.id,
    status:           "COMPLETED",
    blockchainAmount: v.blockchainAmount?.toFixed(8) ?? null,
    creditedAmount:   creditDecimal.toFixed(8),
    difference,
  };
}

// ── Re-validate (FAILED → VERIFYING) ─────────────────────────────────────────

/**
 * Re-queues a FAILED / EXPIRED / VERIFICATION_DELAYED verification for a fresh
 * blockchain verification cycle.
 *
 * Transitions to VERIFYING and resets verificationAttempts → 0, firstSeenAt →
 * now, and nextCheckAt → now so the worker picks it up on the next tick as if
 * it were brand-new. The age-based slow-poll and expiry clocks restart from
 * zero, preventing an old verification from entering VERIFICATION_DELAYED
 * immediately after re-validation.
 *
 * Preserved: verificationId, txHash, network, senderAddress, recipientAddress,
 * tokenContract, blockchain data, audit history, and timeline entries.
 *
 * Creates an admin audit log (DEPOSIT_REVALIDATION_REQUESTED).
 * Does NOT notify the user (re-validation is an admin action).
 */
export async function requestRevalidation(
  adminId: string,
  id:      string,
  ip?:     string,
) {
  const v = await repo.findById(id);
  if (!v) {
    throw new AppError("Verification not found", HTTP_STATUS.NOT_FOUND, "VERIFICATION_NOT_FOUND");
  }

  const REVALIDATABLE = ["FAILED", "EXPIRED", "VERIFICATION_DELAYED"] as const;

  if (!(REVALIDATABLE as readonly string[]).includes(v.verificationStatus)) {
    throw new AppError(
      `Re-validation is only available for FAILED, EXPIRED, or VERIFICATION_DELAYED verifications. Current status: ${v.verificationStatus}`,
      HTTP_STATUS.CONFLICT,
      "REVALIDATION_NOT_ALLOWED",
    );
  }

  const now = new Date();

  // Refresh recipientAddress to the current active company wallet for this
  // network. The stored snapshot may be a placeholder (set when the wallet was
  // not yet configured). The comparison in processOne2 uses v.recipientAddress,
  // so if it still holds the old placeholder, every re-validate cycle will fail
  // "Wrong recipient" regardless of the on-chain result.
  // Fall back to the existing stored address if no wallet is configured yet.
  let refreshedRecipient: string | undefined;
  try {
    refreshedRecipient = await getCompanyWalletAddress(v.network);
    if (refreshedRecipient !== v.recipientAddress) {
      logger.info(
        { verificationId: v.id, network: v.network, old: v.recipientAddress, new: refreshedRecipient },
        "DepositVerification: re-validate refreshing recipientAddress to current company wallet",
      );
    }
  } catch {
    // No active wallet configured — keep the existing address; cron will fail with a clear message.
    logger.warn({ verificationId: v.id, network: v.network }, "DepositVerification: re-validate could not fetch current company wallet — keeping existing recipientAddress");
  }

  const updated = await repo.transition(v.id, "VERIFYING", {
    nextCheckAt:          now,
    firstSeenAt:          now,
    verificationAttempts: 0,
    ...(refreshedRecipient !== undefined && { recipientAddress: refreshedRecipient }),
  }, [...REVALIDATABLE]);

  if (!updated) {
    throw new AppError(
      "Re-validation request failed — verification status changed concurrently. Please refresh and try again.",
      HTTP_STATUS.CONFLICT,
      "CONCURRENT_TRANSITION",
    );
  }

  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action:       "DEPOSIT_REVALIDATION_REQUESTED",
        targetUserId: v.userId,
        details: {
          verificationId:  v.id,
          txHash:          v.txHash,
          network:         v.network,
          previousStatus:  v.verificationStatus,
          newStatus:       "VERIFYING",
          failureReason:   v.failureReason,
          ...(ip && { ipAddress: ip }),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (auditErr) {
    logger.warn({ auditErr, verificationId: id }, "DepositVerification: re-validate audit log failed (non-fatal)");
  }

  logger.info(
    { verificationId: id, adminId, failureReason: v.failureReason },
    `DepositVerification: REVALIDATION REQUESTED — ${v.verificationStatus}→VERIFYING`,
  );

  return {
    verificationId:  v.id,
    previousStatus:  v.verificationStatus,
    newStatus:       "VERIFYING" as const,
    nextCheckAt:     updated.nextCheckAt,
    message:         "Verification re-queued. The worker will re-check the blockchain transaction on the next tick.",
  };
}

// ── Manual rejection ──────────────────────────────────────────────────────────

const REJECTABLE_STATUSES = [
  "TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS",
  "VERIFICATION_DELAYED", "CONFIRMED", "FAILED", "EXPIRED",
] as const;

/**
 * Manually rejects a verification, transitioning it to the terminal REJECTED state.
 *
 * Allowed from any non-terminal status except COMPLETED and CREDITED.
 * Requires a mandatory reason. Creates audit log + user notification.
 *
 * REJECTED is a terminal state — no further transitions are possible.
 */
export async function manualRejectVerification(
  adminId: string,
  id:      string,
  reason:  string,
  ip?:     string,
) {
  const v = await repo.findById(id);
  if (!v) {
    throw new AppError("Verification not found", HTTP_STATUS.NOT_FOUND, "VERIFICATION_NOT_FOUND");
  }

  if (v.verificationStatus === "COMPLETED" || v.verificationStatus === "CREDITED") {
    throw new AppError(
      `Cannot reject a ${v.verificationStatus} verification — funds have already been credited`,
      HTTP_STATUS.CONFLICT,
      "VERIFICATION_CREDITED",
    );
  }

  if (v.verificationStatus === "REJECTED") {
    throw new AppError(
      "Verification has already been rejected",
      HTTP_STATUS.CONFLICT,
      "ALREADY_REJECTED",
    );
  }

  const updated = await repo.transition(
    v.id,
    "REJECTED",
    { failureReason: reason },
    [...REJECTABLE_STATUSES],
  );

  if (!updated) {
    throw new AppError(
      "Rejection failed — verification status changed concurrently. Please refresh and try again.",
      HTTP_STATUS.CONFLICT,
      "CONCURRENT_TRANSITION",
    );
  }

  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action:       "DEPOSIT_MANUALLY_REJECTED",
        targetUserId: v.userId,
        details: {
          verificationId: v.id,
          txHash:         v.txHash,
          network:        v.network,
          previousStatus: v.verificationStatus,
          newStatus:      "REJECTED",
          reason,
          ...(ip && { ipAddress: ip }),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (auditErr) {
    logger.warn({ auditErr, verificationId: id }, "DepositVerification: reject audit log failed (non-fatal)");
  }

  void notificationService.create({
    userId:  v.userId,
    type:    "DEPOSIT_REJECTED",
    title:   "Deposit Rejected",
    message: `Your deposit submission (${v.txHash.slice(0, 12)}…) has been reviewed and rejected. Reason: ${reason}`,
    metadata: {
      verificationId: v.id,
      txHash:         v.txHash,
      network:        v.network,
      reason,
    } as Prisma.InputJsonValue,
  });

  logger.info(
    { verificationId: id, adminId, previousStatus: v.verificationStatus },
    "DepositVerification: MANUALLY REJECTED",
  );

  return {
    verificationId:  v.id,
    status:          "REJECTED" as const,
    reason,
    message:         "Verification rejected. The user has been notified.",
  };
}

// ── Worker entry point ────────────────────────────────────────────────────────

export async function processPendingVerifications(): Promise<TickStats> {
  const startMs  = Date.now();
  const now      = new Date();
  const settings = await getWorkerSettings();
  const pending  = await repo.findPendingForWorker(now);

  const empty: TickStats = {
    total: 0, completed: 0, failed: 0, expired: 0, skipped: 0, active: 0, durationMs: 0,
  };
  if (pending.length === 0) return empty;

  const results = await runWithConcurrency(
    pending,
    settings.concurrencyLimit,
    (v) =>
      processOne(v, settings.pollMs, settings.delayThresholdMs, settings.delayedPollMs).catch((err) => {
        logger.error({ err, verificationId: v.id }, "DepositVerification: unhandled error in processOne");
        return "failed" as ProcessResult;
      }),
  );

  const stats: TickStats = {
    total:      pending.length,
    completed:  0,
    failed:     0,
    expired:    0,
    skipped:    0,
    active:     0,
    durationMs: Date.now() - startMs,
  };

  for (const r of results) {
    if      (r === "completed") stats.completed++;
    else if (r === "failed")    stats.failed++;
    else if (r === "expired")   stats.expired++;
    else if (r === "skipped")   stats.skipped++;
    else if (r === "active")    stats.active++;
  }

  return stats;
}

// ── Core verification logic ───────────────────────────────────────────────────

async function processOne(
  v:                VerificationRow,
  pollMs:           number,
  delayThresholdMs: number,
  delayedPollMs:    number,
): Promise<ProcessResult> {
  if (isTerminal(v.verificationStatus)) return "skipped";

  const now = new Date();

  // ── M3: Crash recovery — CREDITED stuck before COMPLETED ─────────────────

  if (v.verificationStatus === "CREDITED") {
    const completedAt = new Date();
    await repo.transition(v.id, "COMPLETED", { completedAt }, ["CREDITED"]);
    logger.info({ verificationId: v.id }, "DepositVerification: crash recovery — CREDITED→COMPLETED");
    return "completed";
  }

  // ── M3: Crash recovery — CONFIRMED stuck before credit completed ──────────

  if (v.verificationStatus === "CONFIRMED") {
    if (!v.blockchainAmount) {
      await repo.transition(v.id, "FAILED", {
        failureReason: "Crash recovery: blockchainAmount not stored on CONFIRMED record",
      });
      void notificationService.create({
        userId:  v.userId,
        type:    "DEPOSIT_FAILED",
        title:   "Deposit Verification Failed",
        message: "Your deposit verification could not be completed due to a system error. Please contact support with your transaction hash.",
        metadata: { verificationId: v.id, txHash: v.txHash, reason: "crash_recovery_no_amount" } as Prisma.InputJsonValue,
      });
      logger.error({ verificationId: v.id }, "DepositVerification: CONFIRMED but no blockchainAmount — FAILED");
      return "failed";
    }
    logger.info({ verificationId: v.id }, "DepositVerification: crash recovery — resuming CONFIRMED credit");
    return creditWithRetry(v, v.blockchainAmount, v.confirmations, v.confirmedAt ?? now);
  }

  // ── H1: Optimistic lock on first pickup (TX_SUBMITTED → VERIFYING) ────────

  if (v.verificationStatus === "TX_SUBMITTED") {
    const moved = await repo.transition(v.id, "VERIFYING", {
      firstSeenAt:          now,
      verificationAttempts: 0,
      nextCheckAt:          now,
    }, ["TX_SUBMITTED"]);
    if (!moved) return "skipped";
  }

  const newAttempts = v.verificationAttempts + 1;
  // Age is measured from firstSeenAt — reset to "now" on re-validate so the
  // delay threshold clock restarts cleanly for re-submitted records.
  // Falls back to createdAt for brand-new TX_SUBMITTED → VERIFYING transitions
  // where firstSeenAt was just set above (same value as now).
  const ageMs       = Date.now() - (v.firstSeenAt ?? v.createdAt).getTime();

  // ── Delay threshold: VERIFYING → VERIFICATION_DELAYED ────────────────────
  //
  // Triggered only when still VERIFYING (TX not found within delayThresholdMs).
  // WAITING_CONFIRMATIONS and VERIFICATION_DELAYED records skip this block.
  // The verification remains active — no funds are ever automatically expired.

  if (v.verificationStatus === "VERIFYING" && ageMs > delayThresholdMs) {
    await repo.transition(v.id, "VERIFICATION_DELAYED", {
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
      nextCheckAt:          nextCheckAt(delayedPollMs),
    }, [...ACTIVE_VS]);

    // Audit log — best-effort; do not fail the state transition if this throws
    try {
      const superAdminId = await getSuperAdminId();
      await prisma.adminLog.create({
        data: {
          adminId:      superAdminId,
          action:       "DEPOSIT_VERIFICATION_DELAYED",
          targetUserId: v.userId,
          details: {
            verificationId: v.id,
            txHash:         v.txHash,
            network:        v.network,
            ageMinutes:     Math.round(ageMs / 60_000),
            attempts:       newAttempts,
            reason:         `No transaction found on-chain after ${Math.round(ageMs / 60_000)} minute(s); entering slow-poll mode`,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (auditErr) {
      logger.warn({ auditErr, verificationId: v.id }, "DepositVerification: VERIFICATION_DELAYED audit log failed (non-fatal)");
    }

    // Notify user that verification is taking longer than expected
    void notificationService.create({
      userId:  v.userId,
      type:    "DEPOSIT_VERIFICATION_DELAYED",
      title:   "Deposit Verification Delayed",
      message: `Your transaction (${v.txHash.slice(0, 12)}…) is taking longer than expected to verify on the blockchain. We will continue checking automatically — no action is needed from you.`,
      metadata: {
        verificationId: v.id,
        txHash:         v.txHash,
        network:        v.network,
        ageMinutes:     Math.round(ageMs / 60_000),
      } as Prisma.InputJsonValue,
    });

    logger.warn(
      { verificationId: v.id, txHash: v.txHash, ageMinutes: Math.round(ageMs / 60_000), attempts: newAttempts },
      "DepositVerification: VERIFICATION_DELAYED — entering slow-poll mode",
    );
    return "active";
  }

  // ── Call blockchain adapter ───────────────────────────────────────────────
  //
  // VERIFICATION_DELAYED records continue polling at delayedPollMs rate.
  // If the TX is eventually found, verification proceeds normally through
  // WAITING_CONFIRMATIONS → CONFIRMED → CREDITED → COMPLETED.

  const adapter = getAdapter(v.network);
  let adapterResult;

  try {
    adapterResult = await adapter.verifyTransaction(v.txHash, v.recipientAddress ?? undefined);
  } catch (err) {
    // Preserve current status (VERIFYING or VERIFICATION_DELAYED) on adapter error
    const keepStatus = v.verificationStatus === "VERIFICATION_DELAYED"
      ? "VERIFICATION_DELAYED" as const
      : "VERIFYING" as const;
    await repo.transition(v.id, keepStatus, {
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
      nextCheckAt:          nextCheckAt(activePollMs(v.verificationStatus, pollMs, delayedPollMs)),
    }, [...ACTIVE_VS]);
    logger.warn({ err, verificationId: v.id }, "DepositVerification: adapter error — will retry");
    return "active";
  }

  // TX not found yet — preserve current status
  if (!adapterResult.found) {
    const keepStatus = v.verificationStatus === "VERIFICATION_DELAYED"
      ? "VERIFICATION_DELAYED" as const
      : "VERIFYING" as const;
    await repo.transition(v.id, keepStatus, {
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
      nextCheckAt:          nextCheckAt(activePollMs(v.verificationStatus, pollMs, delayedPollMs)),
    }, [...ACTIVE_VS]);
    return "active";
  }

  const details = adapterResult.details;

  // ── Validate TX ───────────────────────────────────────────────────────────

  if (!details.success) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        "Blockchain transaction reverted or failed on-chain",
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    }, [...ACTIVE_VS]);
    void notificationService.create({
      userId:  v.userId,
      type:    "DEPOSIT_FAILED",
      title:   "Deposit Verification Failed",
      message: "Your transaction failed on the blockchain and cannot be credited. Please send a new transaction.",
      metadata: { verificationId: v.id, txHash: v.txHash, reason: "tx_reverted" } as Prisma.InputJsonValue,
    });
    return "failed";
  }

  if (details.network !== v.network) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        `Wrong network: expected ${v.network}, got ${details.network}`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    }, [...ACTIVE_VS]);
    void notificationService.create({
      userId:  v.userId,
      type:    "DEPOSIT_FAILED",
      title:   "Deposit Verification Failed",
      message: `Your transaction was detected on an unsupported network. Only USDT on BEP20 (BSC) is accepted.`,
      metadata: { verificationId: v.id, txHash: v.txHash, reason: "wrong_network" } as Prisma.InputJsonValue,
    });
    return "failed";
  }

  if (details.recipientAddress.toLowerCase() !== v.recipientAddress.toLowerCase()) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        `Wrong recipient — funds sent to ${details.recipientAddress}, expected ${v.recipientAddress}`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    }, [...ACTIVE_VS]);
    void notificationService.create({
      userId:  v.userId,
      type:    "DEPOSIT_FAILED",
      title:   "Deposit Verification Failed",
      message: "The funds were not sent to Prime Wave's deposit address. Please always send to the address shown on the deposit page.",
      metadata: { verificationId: v.id, txHash: v.txHash, reason: "wrong_recipient" } as Prisma.InputJsonValue,
    });
    return "failed";
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
  // Once the TX is found (even from VERIFICATION_DELAYED), resume normal polling.

  if (details.confirmations < v.requiredConfirmations) {
    await repo.transition(v.id, "WAITING_CONFIRMATIONS", {
      ...blockchainUpdate,
      nextCheckAt: nextCheckAt(pollMs),
    }, [...ACTIVE_VS]);
    logger.info(
      {
        verificationId: v.id,
        confirmations:  details.confirmations,
        required:       v.requiredConfirmations,
      },
      "DepositVerification: WAITING_CONFIRMATIONS",
    );
    return "active";
  }

  // ── CONFIRMED ─────────────────────────────────────────────────────────────

  const confirmedAt  = new Date();
  const confirmedRow = await repo.transition(
    v.id,
    "CONFIRMED",
    { ...blockchainUpdate, confirmedAt },
    [...ACTIVE_VS],
  );

  if (!confirmedRow) return "skipped";

  logger.info({ verificationId: v.id, txHash: v.txHash }, "DepositVerification: CONFIRMED — crediting wallet");

  return creditWithRetry(v, details.amount, details.confirmations, confirmedAt);
}

// ── Credit wallet — reuses approveDeposit() pipeline ─────────────────────────

async function creditVerifiedDeposit(
  v:             VerificationRow,
  amount:        Prisma.Decimal,
  confirmations: number,
  confirmedAt:   Date,
): Promise<void> {
  try {
    const superAdminId = await getSuperAdminId();

    let depositRequest: { id: string; status: string } | null =
      await prisma.depositRequest.findUnique({
        where:  { txHash: v.txHash },
        select: { id: true, status: true },
      });

    if (!depositRequest) {
      try {
        depositRequest = await prisma.depositRequest.create({
          data: {
            userId:        v.userId,
            amount,
            network:       v.network,
            txHash:        v.txHash,
            companyWallet: v.recipientAddress,
            status:        "PENDING",
          },
          select: { id: true, status: true },
        });

        await repo.linkDeposit(v.id, depositRequest.id);

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
              amount:         amount.toFixed(8),
              confirmations,
              approvalMode:   "AUTOMATIC",
            } as Prisma.InputJsonValue,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          depositRequest = await prisma.depositRequest.findUnique({
            where:  { txHash: v.txHash },
            select: { id: true, status: true },
          });
          if (!depositRequest) throw e;
        } else {
          throw e;
        }
      }
    }

    if (depositRequest.status === "PENDING" || depositRequest.status === "CONFIRMING") {
      await approveDeposit(superAdminId, depositRequest.id);
    } else if (depositRequest.status !== "APPROVED") {
      throw new Error(
        `DepositRequest ${depositRequest.id} is in unexpected status ${depositRequest.status} — cannot auto-credit`,
      );
    }

    const creditedAt = new Date();
    const credited   = await repo.transition(v.id, "CREDITED", { creditedAt }, ["CONFIRMED"]);

    if (!credited) {
      logger.info(
        { verificationId: v.id },
        "DepositVerification: creditVerifiedDeposit — CONFIRMED lock won by concurrent worker, exiting",
      );
      return;
    }

    const completedAt = new Date();
    await repo.transition(v.id, "COMPLETED", { completedAt }, ["CREDITED"]);

    // Notify user that deposit is complete (auto-verified path)
    void notificationService.create({
      userId:  v.userId,
      type:    "DEPOSIT_APPROVED",
      title:   "Deposit Credited",
      message: `Your deposit of $${amount.toFixed(2)} USDT has been blockchain-verified and credited to your Deposit Wallet.`,
      metadata: {
        verificationId: v.id,
        depositId:      depositRequest.id,
        txHash:         v.txHash,
        amount:         amount.toFixed(8),
        network:        v.network,
        approvalMode:   "AUTOMATIC",
      } as Prisma.InputJsonValue,
    });

    eventBus.emitDepositVerified({
      verificationId: v.id,
      depositId:      depositRequest.id,
      userId:         v.userId,
      amount:         amount.toFixed(8),
      network:        v.network,
      txHash:         v.txHash,
      creditedAt,
    });

    logger.info(
      { verificationId: v.id, depositId: depositRequest.id, amount: amount.toFixed(2) },
      "DepositVerification: COMPLETED — wallet credited",
    );
  } catch (err) {
    logger.error(
      { err, verificationId: v.id },
      "DepositVerification: credit pipeline failed — transitioning to FAILED",
    );
    await repo.transition(v.id, "FAILED", {
      failureReason: err instanceof Error ? err.message : "Credit pipeline failed (unknown error)",
    }).catch(() => { /* best effort */ });

    void notificationService.create({
      userId:  v.userId,
      type:    "DEPOSIT_FAILED",
      title:   "Deposit Processing Error",
      message: "There was an error processing your deposit. Our team has been notified. Please contact support if this issue persists.",
      metadata: { verificationId: v.id, txHash: v.txHash } as Prisma.InputJsonValue,
    });
  }
}

// ── Pool-timeout resilience ────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Returns true if the error is a Prisma connection-pool timeout.
 * Pool timeouts are transient infrastructure faults — not permanent failures.
 */
function isPoolTimeoutError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.includes("Timed out fetching a new connection from the connection pool")
  );
}

/**
 * Wraps creditVerifiedDeposit with exponential-backoff retries for connection-
 * pool timeouts.
 *
 * Retry schedule: 250 ms → 500 ms → 1 s → 2 s → 4 s (5 total attempts).
 *
 * If all retries are exhausted the verification is reset to VERIFYING with
 * nextCheckAt = now + 30 s so the worker retries naturally on the next tick.
 * The user receives a non-alarming "taking slightly longer" notification.
 *
 * Any non-pool-timeout error is re-thrown immediately (handled by the caller's
 * existing catch block which transitions to FAILED).
 */
async function creditWithRetry(
  v:             VerificationRow,
  amount:        Prisma.Decimal,
  confirmations: number,
  confirmedAt:   Date,
): Promise<ProcessResult> {
  const BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000] as const;

  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    try {
      await creditVerifiedDeposit(v, amount, confirmations, confirmedAt);
      return "completed";
    } catch (err) {
      if (!isPoolTimeoutError(err)) throw err; // non-transient — re-throw for caller

      const delayMs = BACKOFF_MS[attempt]!;
      logger.warn(
        { verificationId: v.id, attempt: attempt + 1, maxAttempts: BACKOFF_MS.length, nextRetryMs: delayMs },
        "DepositVerification: DB pool timeout during credit — retrying after backoff",
      );
      await sleep(delayMs);
    }
  }

  // All retries exhausted — reset to VERIFYING so the worker retries organically.
  // This is never a permanent failure: the blockchain confirmation is already stored
  // and crash recovery (M3) will also resume if the process restarts.
  logger.error(
    { verificationId: v.id },
    "DepositVerification: DB pool timeout — all retries exhausted; resetting CONFIRMED→VERIFYING for next tick",
  );

  // Non-alarming user notification — funds are safe, credit is only delayed
  void notificationService.create({
    userId:  v.userId,
    type:    "DEPOSIT_APPROVED",
    title:   "Deposit Credit Delayed",
    message: "We've confirmed your transaction on the blockchain. Final wallet credit is taking slightly longer than expected. No action is required.",
    metadata: { verificationId: v.id, txHash: v.txHash, reason: "pool_timeout_retry" } as Prisma.InputJsonValue,
  });

  // Best-effort reset — if this also fails, M3 crash recovery handles CONFIRMED on the next tick
  try {
    await repo.transition(v.id, "VERIFYING", {
      nextCheckAt: new Date(Date.now() + 30_000),
    });
  } catch (resetErr) {
    logger.error(
      { resetErr, verificationId: v.id },
      "DepositVerification: failed to reset CONFIRMED→VERIFYING after pool exhaustion — M3 will recover on next tick",
    );
  }

  return "active";
}
