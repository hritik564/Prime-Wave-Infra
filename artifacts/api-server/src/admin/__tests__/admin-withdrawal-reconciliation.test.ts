import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("../../notifications/notifications.service", () => ({
  notificationService: { create: vi.fn() },
}));

vi.mock("../../deposit-verification/adapter/bsc/bsc-config", () => ({
  getBscConfig: vi.fn(),
}));

vi.mock("../../services/blockchain/blockchain.factory", () => ({
  getWithdrawalGateway: vi.fn(),
  isGatewayConfigured: vi.fn(),
}));

import { prisma } from "../../config/prisma";
import { reconcileApprovedWithdrawal } from "../admin-withdrawals.service";

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function makeTransaction(status: string) {
  const tx = {
    withdrawalRequest: {
      findUnique: vi.fn().mockResolvedValue({
        id: "withdrawal-103",
        userId: "user-1",
        amount: { toString: () => "125.00" },
        network: "BEP20",
        status,
        walletAddress: "0x1111111111111111111111111111111111111111",
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    adminLog: { create: vi.fn().mockResolvedValue({ id: "admin-log-1" }) },
    withdrawalEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
  };

  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  return tx;
}

describe("guarded withdrawal reconciliation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves APPROVED to MANUAL_REVIEW atomically without financial mutations", async () => {
    const tx = makeTransaction("APPROVED");

    const result = await reconcileApprovedWithdrawal("admin-1", "withdrawal-103", {
      reason: "Accounting history requires investigation.",
    });

    expect(result).toMatchObject({
      withdrawalId: "withdrawal-103",
      status: "MANUAL_REVIEW",
      alreadyReconciled: false,
    });
    expect(tx.withdrawalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "withdrawal-103", status: "APPROVED" },
      data: { status: "MANUAL_REVIEW" },
    });
    expect(tx.adminLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        adminId: "admin-1",
        action: "WITHDRAWAL_MOVED_TO_MANUAL_REVIEW",
        targetUserId: "user-1",
        details: expect.objectContaining({
          previousState: "APPROVED",
          newState: "MANUAL_REVIEW",
          financialOperation: "NONE",
        }),
      }),
    }));
    expect(tx.withdrawalEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        withdrawalId: "withdrawal-103",
        eventType: "MANUAL_REVIEW",
        details: expect.objectContaining({
          administrativeActor: "admin-1",
          reconciliationReason: "Accounting history requires investigation.",
          financialOperation: "NONE",
        }),
      }),
    }));
  });

  it("does not touch wallet or ledger models", async () => {
    const tx = makeTransaction("APPROVED");

    await reconcileApprovedWithdrawal("admin-1", "withdrawal-103", { reason: "Review" });

    expect(Object.keys(tx)).toEqual(["withdrawalRequest", "adminLog", "withdrawalEvent"]);
    expect(tx.withdrawalRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns an idempotent no-op for MANUAL_REVIEW without duplicate audit records", async () => {
    const tx = makeTransaction("MANUAL_REVIEW");

    await expect(
      reconcileApprovedWithdrawal("admin-1", "withdrawal-103", { reason: "Repeat" }),
    ).resolves.toEqual({
      withdrawalId: "withdrawal-103",
      status: "MANUAL_REVIEW",
      alreadyReconciled: true,
    });

    expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "PROCESSING", "BROADCAST_UNKNOWN", "COMPLETED", "REJECTED"])(
    "rejects %s without changing state or accounting",
    async (status) => {
      const tx = makeTransaction(status);

      await expect(
        reconcileApprovedWithdrawal("admin-1", "withdrawal-103", { reason: "Review" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "WITHDRAWAL_NOT_APPROVED",
      });

      expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
      expect(tx.adminLog.create).not.toHaveBeenCalled();
      expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
    },
  );

  it("returns a conflict when the conditional update observes a concurrent state change", async () => {
    const tx = makeTransaction("APPROVED");
    tx.withdrawalRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reconcileApprovedWithdrawal("admin-1", "withdrawal-103", { reason: "Review" }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WITHDRAWAL_STATE_CHANGED",
    });

    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
  });
});