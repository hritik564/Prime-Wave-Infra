export type ProcessorFailureTarget =
  | "PENDING"
  | "BROADCAST_UNKNOWN"
  | "COMPLETED";

export type ProcessorFailureClassification =
  | "TRANSACTION_CONFIRMED"
  | "PRE_SIGNING_FAILURE"
  | "AMBIGUOUS_BROADCAST";

export interface ProcessorFailureEvidence {
  status: string;
  txHash?: string | null;
  transactionConfirmed?: boolean;
  transactionOutcomeAmbiguous?: boolean;
  signingOrBroadcastingDidNotOccur?: boolean;
}

export interface ProcessorFailureDecision {
  targetStatus: ProcessorFailureTarget;
  classification: ProcessorFailureClassification;
  safeToRetry: boolean;
}

/**
 * Decide the only safe business outcome for an automatic processor failure.
 *
 * A generic exception is never enough to release funds. The caller must provide
 * evidence for the pre-signing branch; protected processor states default to
 * BROADCAST_UNKNOWN.
 */
export function decideProcessorFailure(
  evidence: ProcessorFailureEvidence,
): ProcessorFailureDecision {
  if (evidence.transactionConfirmed) {
    return {
      targetStatus: "COMPLETED",
      classification: "TRANSACTION_CONFIRMED",
      safeToRetry: false,
    };
  }

  const preSigningState =
    evidence.status === "VALIDATING" ||
    evidence.status === "QUEUED" ||
    evidence.status === "PROCESSING";

  if (
    preSigningState &&
    !evidence.txHash &&
    evidence.signingOrBroadcastingDidNotOccur &&
    !evidence.transactionOutcomeAmbiguous
  ) {
    return {
      targetStatus: "PENDING",
      classification: "PRE_SIGNING_FAILURE",
      safeToRetry: true,
    };
  }

  return {
    targetStatus: "BROADCAST_UNKNOWN",
    classification: "AMBIGUOUS_BROADCAST",
    safeToRetry: false,
  };
}