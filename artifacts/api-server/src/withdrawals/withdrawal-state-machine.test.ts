import { describe, expect, it } from "vitest";
import {
  isWithdrawalTransitionAllowed,
  WITHDRAWAL_STATE_TRANSITIONS,
} from "./withdrawal-state-machine";

describe("withdrawal state transition matrix", () => {
  it("allows the guarded automatic path and safe unknown-broadcast branch", () => {
    expect(isWithdrawalTransitionAllowed("PENDING", "VALIDATING")).toBe(true);
    expect(isWithdrawalTransitionAllowed("PROCESSING", "SIGNED")).toBe(true);
    expect(isWithdrawalTransitionAllowed("BROADCASTING", "CONFIRMING")).toBe(true);
    expect(isWithdrawalTransitionAllowed("BROADCASTING", "BROADCAST_UNKNOWN")).toBe(true);
  });

  it("does not allow terminal states to transition again", () => {
    for (const terminal of ["COMPLETED", "FAILED", "REJECTED", "CANCELLED"] as const) {
      expect(WITHDRAWAL_STATE_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it("rejects illegal skips and backwards financial transitions", () => {
    expect(isWithdrawalTransitionAllowed("PENDING", "COMPLETED")).toBe(false);
    expect(isWithdrawalTransitionAllowed("CONFIRMING", "FAILED")).toBe(false);
    expect(isWithdrawalTransitionAllowed("COMPLETED", "PENDING")).toBe(false);
  });
});