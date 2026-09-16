export type WithdrawalAdminAction =
  | "APPROVE"
  | "REJECT"
  | "REJECT_AND_REFUND"
  | "MOVE_TO_MANUAL_REVIEW";

const ACTIONS_BY_STATUS: Record<string, readonly WithdrawalAdminAction[]> = {
  PENDING: ["APPROVE", "REJECT"],
  APPROVED: ["REJECT", "MOVE_TO_MANUAL_REVIEW"],
  PROCESSING: [],
  BROADCAST_UNKNOWN: ["REJECT_AND_REFUND"],
  MANUAL_REVIEW: ["REJECT"],
  COMPLETED: [],
  REJECTED: [],
  UNDER_REVIEW: ["REJECT"],
};

export function getWithdrawalAdminActions(status: string): readonly WithdrawalAdminAction[] {
  return ACTIONS_BY_STATUS[status] ?? [];
}