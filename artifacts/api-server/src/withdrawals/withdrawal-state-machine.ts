export type WithdrawalState =
  | "PENDING"
  | "VALIDATING"
  | "QUEUED"
  | "PROCESSING"
  | "SIGNED"
  | "BROADCASTING"
  | "BROADCAST_UNKNOWN"
  | "CONFIRMING"
  | "MANUAL_REVIEW"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED";

/**
 * Automatic-withdrawal transition matrix.
 *
 * Every financial side effect is attached to a conditional database update
 * for the source state and claim owner. Terminal states have no outgoing
 * automatic transitions.
 */
export const WITHDRAWAL_STATE_TRANSITIONS: Readonly<Record<WithdrawalState, readonly WithdrawalState[]>> = {
  PENDING: ["VALIDATING", "CANCELLED", "REJECTED"],
  VALIDATING: ["QUEUED", "FAILED", "MANUAL_REVIEW", "PENDING"],
  QUEUED: ["PROCESSING", "PENDING", "FAILED", "MANUAL_REVIEW"],
  PROCESSING: ["SIGNED", "BROADCAST_UNKNOWN", "FAILED", "MANUAL_REVIEW"],
  SIGNED: ["BROADCASTING", "BROADCAST_UNKNOWN", "FAILED", "MANUAL_REVIEW"],
  BROADCASTING: ["CONFIRMING", "BROADCAST_UNKNOWN", "MANUAL_REVIEW"],
  BROADCAST_UNKNOWN: ["CONFIRMING", "MANUAL_REVIEW"],
  CONFIRMING: ["COMPLETED", "MANUAL_REVIEW"],
  MANUAL_REVIEW: ["APPROVED", "REJECTED", "CANCELLED", "PROCESSING"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PROCESSING", "COMPLETED", "REJECTED"],
  COMPLETED: [],
  FAILED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function isWithdrawalTransitionAllowed(
  from: WithdrawalState,
  to: WithdrawalState,
): boolean {
  return WITHDRAWAL_STATE_TRANSITIONS[from].includes(to);
}