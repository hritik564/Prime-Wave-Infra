import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import type { Prisma } from "@prisma/client";

// ── Event type constants ───────────────────────────────────────────────────────

export type WithdrawalEventType =
  | "CREATED"
  | "VALIDATED"
  | "QUEUED"
  | "PROCESSING"
  | "PROCESSOR_FAILURE"
  | "SIGNED"
  | "BROADCAST"
  | "BROADCAST_UNKNOWN"
  | "CONFIRMING"
  | "CONFIRMATION_POLL"
  | "CONFIRMED"
  | "COMPLETED"
  | "FAILED"
  | "REFUNDED"
  | "MANUAL_REVIEW"
  | "RECOVERY_SCAN"
  | "CANCELLED"
  | "APPROVED"
  | "REJECTED";

// ── logEvent ──────────────────────────────────────────────────────────────────

/**
 * Append a new event to the withdrawal timeline.
 * Fire-and-forget safe — any DB error is caught and logged without
 * interrupting the caller's flow.
 */
export async function logWithdrawalEvent(
  withdrawalId: string,
  eventType:    WithdrawalEventType,
  details?:     Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.withdrawalEvent.create({
      data: {
        withdrawalId,
        eventType,
        details: details as Prisma.InputJsonValue | undefined,
      },
    });
    logger.debug(
      { withdrawalId, eventType, details },
      "withdrawal.events: logged",
    );
  } catch (err) {
    logger.error({ withdrawalId, eventType, err }, "withdrawal.events: failed to log event");
  }
}

// ── getWithdrawalEvents ────────────────────────────────────────────────────────

export async function getWithdrawalEvents(withdrawalId: string) {
  return prisma.withdrawalEvent.findMany({
    where:   { withdrawalId },
    orderBy: { createdAt: "asc" },
    select: {
      id:          true,
      eventType:   true,
      details:     true,
      createdAt:   true,
    },
  });
}
