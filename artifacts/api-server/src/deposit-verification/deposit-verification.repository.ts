import { Prisma, type DepositVerificationStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VerificationRow = NonNullable<
  Awaited<ReturnType<typeof findById>>
>;

// ── Selects ───────────────────────────────────────────────────────────────────

const fullSelect = {
  id:                    true,
  userId:                true,
  depositId:             true,
  txHash:                true,
  network:               true,
  senderAddress:         true,
  recipientAddress:      true,
  tokenContract:         true,
  blockchainAmount:      true,
  confirmations:         true,
  requiredConfirmations: true,
  verificationStatus:    true,
  verificationAttempts:  true,
  lastCheckedAt:         true,
  nextCheckAt:           true,
  firstSeenAt:           true,
  confirmedAt:           true,
  creditedAt:            true,
  completedAt:           true,
  failureReason:         true,
  createdAt:             true,
  updatedAt:             true,
} as const;

// ── Queries ───────────────────────────────────────────────────────────────────

export async function findById(id: string) {
  return prisma.depositVerification.findUnique({
    where:  { id },
    select: fullSelect,
  });
}

export async function findByTxHash(txHash: string) {
  return prisma.depositVerification.findUnique({
    where:  { txHash },
    select: { id: true, verificationStatus: true },
  });
}

export async function findByIdForUser(id: string, userId: string) {
  return prisma.depositVerification.findFirst({
    where:  { id, userId },
    select: fullSelect,
  });
}

/**
 * Returns all verifications for a user, newest first (paginated).
 * Used as the "source of truth" deposit history — every submitted TX hash
 * appears here immediately regardless of verification state.
 */
export async function findAllForUser(userId: string, params: { page: number; limit: number }) {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const [records, total] = await prisma.$transaction([
    prisma.depositVerification.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  fullSelect,
    }),
    prisma.depositVerification.count({ where: { userId } }),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    data: records,
    meta: {
      total, page, limit, totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

/**
 * Returns all verifications the worker should process on this tick.
 *
 * Statuses fetched:
 *   TX_SUBMITTED         — awaiting first blockchain check
 *   VERIFYING            — actively polling blockchain
 *   WAITING_CONFIRMATIONS — found, accumulating block confirmations
 *   VERIFICATION_DELAYED — slow-polling; TX not found after threshold
 *   CONFIRMED            — M3: crash recovery — credit step did not complete
 *   CREDITED             — M3: crash recovery — COMPLETED write did not fire
 *
 * nextCheckAt <= now prevents over-polling between worker intervals.
 * CONFIRMED / CREDITED records retain their last nextCheckAt (always in the
 * past relative to the worker's view), so they are always eligible.
 */
export async function findPendingForWorker(now: Date) {
  return prisma.depositVerification.findMany({
    where: {
      verificationStatus: {
        in: ["TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS", "VERIFICATION_DELAYED", "CONFIRMED", "CREDITED"],
      },
      nextCheckAt: { lte: now },
    },
    select:  fullSelect,
    orderBy: { nextCheckAt: "asc" },
    take:    100,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function create(data: {
  userId:               string;
  txHash:               string;
  network:              Prisma.EnumDepositNetworkFilter["equals"];
  recipientAddress:     string;
  requiredConfirmations: number;
  nextCheckAt:          Date;
}) {
  return prisma.depositVerification.create({
    data: {
      userId:               data.userId,
      txHash:               data.txHash,
      network:              data.network as Prisma.DepositVerificationCreateInput["network"],
      recipientAddress:     data.recipientAddress,
      requiredConfirmations: data.requiredConfirmations,
      verificationStatus:   "TX_SUBMITTED",
      nextCheckAt:          data.nextCheckAt,
    },
    select: fullSelect,
  });
}

/**
 * Transition a verification record to a new status.
 *
 * ── Without fromStatuses (legacy) ────────────────────────────────────────────
 * Unconditional UPDATE — used only for best-effort fallback writes
 * (e.g., the FAILED catch block) where racing is acceptable.
 *
 * ── With fromStatuses (optimistic locking) ───────────────────────────────────
 * Implements a compare-and-swap (CAS) using updateMany with a WHERE clause
 * that filters by `verificationStatus IN (fromStatuses)`.
 *
 * PostgreSQL guarantees that concurrent UPDATEs on the same row are serialized
 * via row-level locking. The second concurrent writer waits for the first to
 * commit, then sees the committed (already-changed) status, matches zero rows,
 * and returns count = 0. The caller must bail out gracefully on null return.
 *
 * Returns null if the row was already transitioned by a concurrent worker.
 * Returns the updated VerificationRow on success.
 *
 * IMPORTANT: `extra` in all fromStatuses code-paths must contain only scalar
 * field writes — no Prisma relational operations (connect / create / etc.).
 */
export async function transition(
  id:            string,
  newStatus:     DepositVerificationStatus,
  extra:         Prisma.DepositVerificationUpdateInput = {},
  fromStatuses?: DepositVerificationStatus[],
): Promise<VerificationRow | null> {
  if (!fromStatuses || fromStatuses.length === 0) {
    return prisma.depositVerification.update({
      where:  { id },
      data:   { verificationStatus: newStatus, ...extra },
      select: fullSelect,
    });
  }

  // Optimistic CAS: only update if status is still in the expected set
  const { count } = await prisma.depositVerification.updateMany({
    where: { id, verificationStatus: { in: fromStatuses } },
    // `extra` always contains scalars in these paths — safe to spread
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data:  { verificationStatus: newStatus, ...(extra as any) },
  });

  if (count === 0) return null; // Another worker won the race — bail out

  // Re-fetch the updated row. The data is already committed; this is a safe read.
  return prisma.depositVerification.findUnique({
    where:  { id },
    select: fullSelect,
  });
}

/**
 * Link a DepositRequest to this verification after the credit step.
 */
export async function linkDeposit(id: string, depositId: string) {
  return prisma.depositVerification.update({
    where:  { id },
    data:   { depositId },
    select: { id: true, depositId: true },
  });
}

// ── Admin list ────────────────────────────────────────────────────────────────

export async function adminList(params: {
  page:    number;
  limit:   number;
  status?: DepositVerificationStatus;
  network?: string;
  search?: string;
}) {
  const { page, limit, status, network, search } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.DepositVerificationWhereInput = {
    ...(status  && { verificationStatus: status }),
    ...(network && { network: network as Prisma.DepositVerificationWhereInput["network"] }),
    ...(search  && {
      OR: [
        { txHash: { contains: search, mode: "insensitive" } },
        { user: { username: { contains: search, mode: "insensitive" } } },
        { user: { email:    { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.depositVerification.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: "desc" },
      select: {
        ...fullSelect,
        user: { select: { id: true, username: true, email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.depositVerification.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}
