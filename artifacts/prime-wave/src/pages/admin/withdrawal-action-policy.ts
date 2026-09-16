export type WithdrawalAdminAction =
  | "APPROVE"
  | "REJECT"
  | "REJECT_AND_REFUND"
  | "MOVE_TO_MANUAL_REVIEW";

export interface FalsePositiveStageCandidate {
  withdrawalId?: string | null;
  status: string;
  txHash?: string | null;
  signedAt?: string | null;
  broadcastAt?: string | null;
}

export function canCorrectFalsePositiveStage(candidate: FalsePositiveStageCandidate): boolean {
  return candidate.withdrawalId === "PW-WD-000130"
    && candidate.status === "BROADCAST_UNKNOWN"
    && !candidate.txHash
    && !candidate.broadcastAt
    && Boolean(candidate.signedAt);
}

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