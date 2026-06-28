import { Prisma, type DepositNetwork } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { getAdapter } from "./adapter/adapter-factory";
import { approveDeposit } from "../admin/admin-deposits.service";
import { eventBus } from "../events/event-bus";
import * as repo from "./deposit-verification.repository";
import type { VerificationRow } from "./deposit-verification.repository";
import type { TickStats } from "./deposit-verification.metrics";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Result code returned by processOne() for metrics collection.
 *   completed — deposit fully credited and marked COMPLETED
 *   failed    — terminal failure (bad TX, credit error, etc.)
 *   expired   — timed out before sufficient confirmations
 *   skipped   — optimistic lock lost; another worker already transitioned this row
 *   active    — TX not yet confirmed; will be re-checked next tick
 */
export type ProcessResult = "completed" | "failed" | "expired" | "skipped" | "active";

// ── Active status set used as fromStatuses in all optimistic-lock transitions ─
// Only rows in one of these statuses should be mutated by the normal worker flow.

const ACTIVE_VS = ["TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS"] as const;

// ── Worker settings ───────────────────────────────────────────────────────────

interface WorkerSettings {
  pollMs:           number;
  concurrencyLimit: number;
  timeoutMs:        number;
}

async function getWorkerSettings(): Promise<WorkerSettings> {
  try {
    const rows = await prisma.systemSettings.findMany({
      where: {
        key: {
          in: [
            "deposit_verification.poll_interval_ms",
            "deposit_verification.concurrency_limit",
            "deposit_verification.timeout_ms",
          ],
        },
      },
      select: { key: true, value: true },
    });
    const m = new Map(rows.map((r) => [r.key, Number(r.value)]));
    return {
      pollMs:           Math.max(1_000,  isFinite(m.get("deposit_verification.poll_interval_ms")  ?? NaN) ? m.get("deposit_verification.poll_interval_ms")!  : 20_000),
      concurrencyLimit: Math.max(1, Math.min(50, isFinite(m.get("deposit_verification.concurrency_limit") ?? NaN) ? m.get("deposit_verification.concurrency_limit")! : 10)),
      timeoutMs:        Math.max(60_000, isFinite(m.get("deposit_verification.timeout_ms")         ?? NaN) ? m.get("deposit_verification.timeout_ms")!         : 1_800_000),
    };
  } catch {
    return { pollMs: 20_000, concurrencyLimit: 10, timeoutMs: 1_800_000 };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTerminal(status: string): boolean {
  return ["COMPLETED", "FAILED", "REJECTED", "EXPIRED"].includes(status);
}

/**
 * Fetch the active company wallet for the given network from the database.
 * Throws if none is configured — a configuration error that must be surfaced.
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

/**
 * Run `fn` over `items` with at most `limit` concurrent executions.
 * Similar to Promise.allSettled but with a configurable concurrency cap.
 * Errors inside `fn` must be caught by the caller — this function does not swallow them.
 */
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

  // Spawn `limit` concurrent "slots" that each consume from the shared queue
  await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, slot),
  );

  return results;
}

// ── Submit ────────────────────────────────────────────────────────────────────

/**
 * Creates a DepositVerification for a submitted transaction hash.
 *
 * txHash is normalized (trimmed + lowercased) by the Zod body schema
 * before this function is called.
 *
 * The worker picks it up immediately (nextCheckAt = now).
 */
export async function submitVerification(
  userId:  string,
  txHash:  string,
  network: string,
) {
  // Duplicate guard — DB @unique on txHash is the backstop, but we prefer
  // a clear 409 message over a generic P2002 unique-violation error.
  const existing = await repo.findByTxHash(txHash);
  if (existing) {
    throw new AppError(
      "Transaction hash already submitted — check your verification status",
      HTTP_STATUS.CONFLICT,
      "DUPLICATE_TX_HASH",
    );
  }

  const recipientAddress = await getCompanyWalletAddress(network);

  // requiredConfirmations comes from the adapter — never from mock statics.
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

// ── Worker entry point ────────────────────────────────────────────────────────

/**
 * Processes all pending verifications due for a check.
 * Called by the worker on each polling interval.
 * Returns per-tick statistics for metrics collection.
 */
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
      processOne(v, settings.pollMs, settings.timeoutMs).catch((err) => {
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
  v:         VerificationRow,
  pollMs:    number,
  timeoutMs: number,
): Promise<ProcessResult> {
  if (isTerminal(v.verificationStatus)) return "skipped";

  const now     = new Date();

  // ── M3: Crash recovery — CREDITED stuck before COMPLETED ─────────────────
  // Window: server crashed after CREDITED was written but before COMPLETED.
  // Recovery: just write COMPLETED (optimistically locked).

  if (v.verificationStatus === "CREDITED") {
    const completedAt = new Date();
    await repo.transition(v.id, "COMPLETED", { completedAt }, ["CREDITED"]);
    logger.info({ verificationId: v.id }, "DepositVerification: crash recovery — CREDITED→COMPLETED");
    return "completed";
  }

  // ── M3: Crash recovery — CONFIRMED stuck before credit completed ──────────
  // Window: server crashed after CONFIRMED was written but before creditVerifiedDeposit
  // returned. The stored blockchainAmount / confirmations / confirmedAt are used
  // to resume — no adapter call needed.

  if (v.verificationStatus === "CONFIRMED") {
    if (!v.blockchainAmount) {
      await repo.transition(v.id, "FAILED", {
        failureReason: "Crash recovery: blockchainAmount not stored on CONFIRMED record",
      });
      logger.error({ verificationId: v.id }, "DepositVerification: CONFIRMED but no blockchainAmount — FAILED");
      return "failed";
    }
    logger.info({ verificationId: v.id }, "DepositVerification: crash recovery — resuming CONFIRMED credit");
    await creditVerifiedDeposit(v, v.blockchainAmount, v.confirmations, v.confirmedAt ?? now);
    return "completed";
  }

  // ── H1: Optimistic lock on first pickup (TX_SUBMITTED → VERIFYING) ────────
  // If another worker already transitioned this row, bail out immediately.

  if (v.verificationStatus === "TX_SUBMITTED") {
    const moved = await repo.transition(v.id, "VERIFYING", {
      firstSeenAt:          now,
      verificationAttempts: 0,
      nextCheckAt:          now,
    }, ["TX_SUBMITTED"]);
    if (!moved) return "skipped"; // Another worker won
  }

  const newAttempts = v.verificationAttempts + 1;

  // ── Time-based expiry (configurable, default 30 min) ─────────────────────

  const ageMs = Date.now() - v.createdAt.getTime();
  if (ageMs > timeoutMs) {
    await repo.transition(v.id, "EXPIRED", {
      failureReason:        `Verification timed out after ${Math.round(ageMs / 60_000)} minute(s) without sufficient confirmations`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    }, [...ACTIVE_VS]);
    logger.warn(
      { verificationId: v.id, txHash: v.txHash, ageMinutes: Math.round(ageMs / 60_000) },
      "DepositVerification: EXPIRED",
    );
    return "expired";
  }

  // ── Call blockchain adapter ───────────────────────────────────────────────

  const adapter = getAdapter(v.network);
  let adapterResult;

  try {
    adapterResult = await adapter.verifyTransaction(v.txHash, v.recipientAddress ?? undefined);
  } catch (err) {
    await repo.transition(v.id, "VERIFYING", {
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
      nextCheckAt:          nextCheckAt(pollMs),
    }, [...ACTIVE_VS]);
    logger.warn({ err, verificationId: v.id }, "DepositVerification: adapter error — will retry");
    return "active";
  }

  // TX not found yet — keep VERIFYING
  if (!adapterResult.found) {
    await repo.transition(v.id, "VERIFYING", {
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
      nextCheckAt:          nextCheckAt(pollMs),
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
    return "failed";
  }

  if (details.network !== v.network) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        `Wrong network: expected ${v.network}, got ${details.network}`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    }, [...ACTIVE_VS]);
    return "failed";
  }

  if (details.recipientAddress.toLowerCase() !== v.recipientAddress.toLowerCase()) {
    await repo.transition(v.id, "FAILED", {
      failureReason:        `Wrong recipient — funds sent to ${details.recipientAddress}, expected ${v.recipientAddress}`,
      verificationAttempts: newAttempts,
      lastCheckedAt:        now,
    }, [...ACTIVE_VS]);
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
  // H1: Optimistic lock — only one concurrent worker can win this transition.

  const confirmedAt   = new Date();
  const confirmedRow  = await repo.transition(
    v.id,
    "CONFIRMED",
    { ...blockchainUpdate, confirmedAt },
    [...ACTIVE_VS],
  );

  if (!confirmedRow) return "skipped"; // Another worker won

  logger.info({ verificationId: v.id, txHash: v.txHash }, "DepositVerification: CONFIRMED — crediting wallet");

  await creditVerifiedDeposit(v, details.amount, details.confirmations, confirmedAt);
  return "completed";
}

// ── Credit wallet — reuses approveDeposit() pipeline ─────────────────────────
//
// Regression guarantee: approveDeposit() is called unchanged. Both auto and
// manual flows produce identical wallet credits, ledger entries, notifications,
// and audit logs after approveDeposit() completes.
//
// Idempotency guarantee: safe to call multiple times for the same verification.
//   • DepositRequest is found-or-created using txHash @unique
//   • approveDeposit is skipped if status is already APPROVED
//   • CONFIRMED → CREDITED uses an optimistic lock (only one worker wins)

async function creditVerifiedDeposit(
  v:             VerificationRow,
  amount:        Prisma.Decimal,
  confirmations: number,
  confirmedAt:   Date,
): Promise<void> {
  try {
    const superAdminId = await getSuperAdminId();

    // ── Idempotent find-or-create DepositRequest ──────────────────────────────
    // Two concurrent workers may both enter here during crash recovery.
    // txHash @unique prevents duplicate inserts; a concurrent P2002 is caught
    // and resolved by re-fetching the row the winner just created.

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
            },
          },
        });
      } catch (e) {
        // Concurrent worker created the DepositRequest — fetch what it created
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          depositRequest = await prisma.depositRequest.findUnique({
            where:  { txHash: v.txHash },
            select: { id: true, status: true },
          });
          if (!depositRequest) throw e; // Shouldn't happen — re-throw to be safe
        } else {
          throw e;
        }
      }
    }

    // ── Call approveDeposit only if not yet approved ──────────────────────────
    // Idempotent: skip if already APPROVED (crash recovery after approve succeeded).

    if (depositRequest.status === "PENDING" || depositRequest.status === "CONFIRMING") {
      await approveDeposit(superAdminId, depositRequest.id);
    } else if (depositRequest.status !== "APPROVED") {
      throw new Error(
        `DepositRequest ${depositRequest.id} is in unexpected status ${depositRequest.status} — cannot auto-credit`,
      );
    }

    // ── Optimistic lock: CONFIRMED → CREDITED ─────────────────────────────────
    // Only one concurrent worker can win this transition.
    // The loser gets count=0 (null return) and bails out gracefully.

    const creditedAt = new Date();
    const credited   = await repo.transition(v.id, "CREDITED", { creditedAt }, ["CONFIRMED"]);

    if (!credited) {
      logger.info(
        { verificationId: v.id },
        "DepositVerification: creditVerifiedDeposit — CONFIRMED lock won by concurrent worker, exiting",
      );
      return;
    }

    // ── CREDITED → COMPLETED ──────────────────────────────────────────────────

    const completedAt = new Date();
    await repo.transition(v.id, "COMPLETED", { completedAt }, ["CREDITED"]);

    // ── Domain event ──────────────────────────────────────────────────────────

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
    }).catch(() => { /* best effort — do not mask the original error */ });
  }
}
