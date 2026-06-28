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
 * Returns all verifications the worker should process on this tick.
 * Statuses that require polling: TX_SUBMITTED, VERIFYING, WAITING_CONFIRMATIONS.
 * nextCheckAt <= now prevents over-polling between worker intervals.
 */
export async function findPendingForWorker(now: Date) {
  return prisma.depositVerification.findMany({
    where: {
      verificationStatus: { in: ["TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS"] },
      nextCheckAt:        { lte: now },
    },
    select: fullSelect,
    orderBy: { nextCheckAt: "asc" },
    take: 100,
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
 * Atomically transition a verification to a new status.
 * Only succeeds if the record is still in the expected current status set.
 * Returns null if the record was already moved by a concurrent process.
 */
export async function transition(
  id:        string,
  newStatus: DepositVerificationStatus,
  extra:     Prisma.DepositVerificationUpdateInput = {},
) {
  return prisma.depositVerification.update({
    where:  { id },
    data:   { verificationStatus: newStatus, ...extra },
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
