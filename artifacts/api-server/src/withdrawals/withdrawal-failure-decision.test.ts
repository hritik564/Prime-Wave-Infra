import { describe, expect, it } from "vitest";
import { decideProcessorFailure } from "./withdrawal-failure-decision";

describe("processor failure decision", () => {
  it("returns a pre-signing failure to PENDING and marks it safe to retry", () => {
    expect(decideProcessorFailure({
      status: "PROCESSING",
      txHash: null,
      signingOrBroadcastingDidNotOccur: true,
    })).toEqual({
      targetStatus: "PENDING",
      classification: "PRE_SIGNING_FAILURE",
      safeToRetry: true,
    });
  });

  it.each(["SIGNED", "BROADCASTING"])(
    "does not return %s failures to PENDING",
    (status) => {
      const result = decideProcessorFailure({
        status,
        txHash: null,
        signingOrBroadcastingDidNotOccur: true,
      });
      expect(result.targetStatus).toBe("BROADCAST_UNKNOWN");
      expect(result.safeToRetry).toBe(false);
    },
  );

  it("preserves an explicitly ambiguous broadcast", () => {
    expect(decideProcessorFailure({
      status: "PROCESSING",
      transactionOutcomeAmbiguous: true,
    }).targetStatus).toBe("BROADCAST_UNKNOWN");
  });

  it("keeps a confirmed transaction completed and non-retryable", () => {
    expect(decideProcessorFailure({
      status: "CONFIRMING",
      txHash: "0xconfirmed",
      transactionConfirmed: true,
    })).toEqual({
      targetStatus: "COMPLETED",
      classification: "TRANSACTION_CONFIRMED",
      safeToRetry: false,
    });
  });

  it("defaults an unclassified exception to the protected state", () => {
    expect(decideProcessorFailure({ status: "PROCESSING" }).targetStatus)
      .toBe("BROADCAST_UNKNOWN");
  });
});