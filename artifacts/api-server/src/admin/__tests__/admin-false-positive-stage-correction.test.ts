import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: { $transaction: vi.fn() },
}));

import { prisma } from "../../config/prisma";
import { reconcileFalsePositiveProcessorStage } from "../admin-withdrawals.service";

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function makeTransaction(overrides: Record<string, unknown> = {}) {
  const tx = {
    withdrawalRequest: {
      findUnique: vi.fn().mockResolvedValue({
        id: "internal-130",
        withdrawalId: "PW-WD-000130",
        userId: "user-130",
        status: "BROADCAST_UNKNOWN",
        txHash: null,
        signedAt: new Date("2026-09-15T12:00:00.000Z"),
        broadcastAt: null,
        claimOwner: null,
        claimToken: null,
        claimExpiresAt: null,
        ...overrides,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    adminLog: { create: vi.fn().mockResolvedValue({ id: "admin-log-130" }) },
    withdrawalEvent: { create: vi.fn().mockResolvedValue({ id: "event-130" }) },
  };
  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  return tx;
}

const input = {
  incidentId: "PW-WD-000130" as const,
  evidenceConfirmed: true as const,
  reason: "Forensic evidence confirms the persisted SIGNED marker was false-positive.",
};

describe("incident-specific false-positive stage correction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears only the stale marker and moves the record to MANUAL_REVIEW", async () => {
    const tx = makeTransaction();

    await expect(
      reconcileFalsePositiveProcessorStage("admin-130", "internal-130", input),
    ).resolves.toEqual({
      withdrawalId: "internal-130",
      status: "MANUAL_REVIEW",
      alreadyReconciled: false,
    });

    expect(tx.withdrawalRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        withdrawalId: "PW-WD-000130",
        status: "BROADCAST_UNKNOWN",
        txHash: null,
        broadcastAt: null,
        signedAt: { not: null },
        claimOwner: null,
        claimToken: null,
      }),
      data: expect.objectContaining({
        status: "MANUAL_REVIEW",
        signedAt: null,
      }),
    }));
    expect(tx.adminLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "WITHDRAWAL_FALSE_POSITIVE_STAGE_CORRECTED",
        details: expect.objectContaining({
          incidentId: "PW-WD-000130",
          financialOperation: "NONE",
          forensicEvidence: expect.objectContaining({
            ethSendRawTransactionCalled: false,
            matchingBscTransaction: false,
          }),
        }),
      }),
    }));
    expect(tx.withdrawalEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        eventType: "MANUAL_REVIEW",
        details: expect.objectContaining({
          source: "incident-forensic-correction",
          clearedFields: ["signedAt"],
        }),
      }),
    }));
    expect(Object.keys(tx)).not.toContain("wallet");
    expect(Object.keys(tx)).not.toContain("walletTransaction");
  });

  it("is idempotent once the incident is in manual review", async () => {
    const tx = makeTransaction({ status: "MANUAL_REVIEW" });

    await expect(
      reconcileFalsePositiveProcessorStage("admin-130", "internal-130", input),
    ).resolves.toEqual({
      withdrawalId: "internal-130",
      status: "MANUAL_REVIEW",
      alreadyReconciled: true,
    });
    expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ txHash: "0xexisting" }, "WITHDRAWAL_TRANSACTION_EVIDENCE_MISMATCH"],
    [{ broadcastAt: new Date() }, "WITHDRAWAL_TRANSACTION_EVIDENCE_MISMATCH"],
    [{ claimOwner: "worker-1" }, "WITHDRAWAL_CLAIM_ACTIVE"],
    [{ withdrawalId: "PW-WD-000129" }, "WITHDRAWAL_INCIDENT_NOT_MATCHED"],
  ])("fails closed for unsafe evidence %j", async (overrides, code) => {
    const tx = makeTransaction(overrides);

    await expect(
      reconcileFalsePositiveProcessorStage("admin-130", "internal-130", input),
    ).rejects.toMatchObject({ code });
    expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
  });
});