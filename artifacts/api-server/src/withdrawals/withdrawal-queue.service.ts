import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

/**
 * Withdrawal Queue Service
 *
 * Manages the pool of withdrawals awaiting processing.
 * No blockchain interaction — purely internal state transitions.
 */

// Statuses that represent an active (in-flight) withdrawal
const ACTIVE_QUEUE_STATUSES = [
  "VALIDATING",
  "QUEUED",
  "PROCESSING",
  "SIGNED",
  "BROADCASTING",
  "BROADCAST_UNKNOWN",
  "CONFIRMING",
  "MANUAL_REVIEW",
] as const;

export async function getQueueItems() {
  return prisma.withdrawalRequest.findMany({
    where:   { status: { in: [...ACTIVE_QUEUE_STATUSES] } },
    orderBy: { createdAt: "asc" },
    select: {
      id:                    true,
      withdrawalId:          true,
      userId:                true,
      currency:              true,
      amount:                true,
      fee:                   true,
      netAmount:             true,
      network:               true,
      walletAddressSnapshot: true,
      status:                true,
      txHash:                true,
      signedAt:              true,
      broadcastAt:           true,
      requestedAt:           true,
      processedAt:           true,
      confirmationBlock:     true,
      confirmationCount:     true,
      failureReason:         true,
      explorerUrl:           true,
      createdAt:             true,
      user: { select: { id: true, username: true, email: true, firstName: true, lastName: true } },
    },
  });
}

export async function enqueue(withdrawalId: string): Promise<void> {
  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data:  { status: "QUEUED" },
  });
  logger.info({ withdrawalId, status: "QUEUED" }, "withdrawal.queue: enqueued");
}

export async function lockForProcessing(withdrawalId: string): Promise<void> {
  await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data:  { status: "PROCESSING", processedAt: new Date() },
  });
  logger.info({ withdrawalId, status: "PROCESSING" }, "withdrawal.queue: locked for processing");
}
