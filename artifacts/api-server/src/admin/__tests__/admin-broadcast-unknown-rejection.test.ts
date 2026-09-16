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
import { notificationService } from "../../notifications/notifications.service";
import { rejectAndRefundBroadcastUnknown } from "../admin-withdrawals.service";

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const amount = { toString: () => "1.02000000" };

function makeTransaction({
  status = "BROADCAST_UNKNOWN",
  txHash = null,
  signedAt = null,
  broadcastAt = null,
  stateChanged = 1,
  lockedBalanceChanged = 1,
  existingRefund = null,
}: {
  status?: string;
  txHash?: string | null;
  signedAt?: Date | null;
  broadcastAt?: Date | null;
  stateChanged?: number;
  lockedBalanceChanged?: number;
  existingRefund?: {
    id: string;
    type: string;
    status: string;
    amount: { toString: () => string };
  } | null;
} = {}) {
  const tx = {
    withdrawalRequest: {
      findUnique: vi.fn().mockResolvedValue({
        id: "withdrawal-121",
        userId: "user-121",
        amount,
        network: "BEP20",
        walletAddress: "0x1111111111111111111111111111111111111111",
        status,
        txHash,
        signedAt,
        broadcastAt,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: stateChanged }),
    },
    wallet: {
      updateMany: vi.fn().mockResolvedValue({ count: lockedBalanceChanged }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "wallet-121" }),
    },
    walletTransaction: {
      findUnique: vi.fn().mockResolvedValue(existingRefund),
      create: vi.fn().mockResolvedValue({ id: "wallet-tx-121" }),
    },
    adminLog: { create: vi.fn().mockResolvedValue({ id: "admin-log-121" }) },
    withdrawalEvent: { create: vi.fn().mockResolvedValue({ id: "event-121" }) },
  };

  transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  return tx;
}

const input = {
  rejectedReason:
    "Broadcast outcome could not be verified and no transaction evidence exists; withdrawal rejected and refunded.",
};

describe("guarded BROADCAST_UNKNOWN reject and refund", () => {
  beforeEach(() => vi.clearAllMocks());

  it("settles only BROADCAST_UNKNOWN with no evidence and releases exactly the withdrawal amount", async () => {
    const tx = makeTransaction();

    await expect(
      rejectAndRefundBroadcastUnknown("admin-1", "withdrawal-121", input),
    ).resolves.toEqual({
      withdrawalId: "withdrawal-121",
      status: "REJECTED",
      alreadyReconciled: false,
      refundedAmount: "1.02000000",
    });

    expect(tx.withdrawalRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "withdrawal-121",
        status: "BROADCAST_UNKNOWN",
        txHash: null,
        signedAt: null,
        broadcastAt: null,
      },
      data: { status: "REJECTED", rejectedReason: input.rejectedReason },
    });
    expect(tx.wallet.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-121",
        lockedWithdrawalBalance: { gte: amount },
      },
      data: {
        lockedWithdrawalBalance: { decrement: amount },
        withdrawalWallet: { increment: amount },
      },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "WITHDRAWAL",
        status: "FAILED",
        amount,
        withdrawalRequestId: "withdrawal-121",
      }),
    }));
    expect(tx.adminLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        adminId: "admin-1",
        action: "WITHDRAWAL_BROADCAST_UNKNOWN_REJECTED",
        targetUserId: "user-121",
      }),
    }));
    expect(tx.withdrawalEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        withdrawalId: "withdrawal-121",
        eventType: "REJECTED",
        details: expect.objectContaining({
          previousState: "BROADCAST_UNKNOWN",
          newState: "REJECTED",
          refundedAmount: "1.02000000",
          releasedLockedAmount: "1.02000000",
        }),
      }),
    }));
    expect(notificationService.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["PENDING", "WITHDRAWAL_NOT_BROADCAST_UNKNOWN"],
    ["APPROVED", "WITHDRAWAL_NOT_BROADCAST_UNKNOWN"],
    ["PROCESSING", "WITHDRAWAL_NOT_BROADCAST_UNKNOWN"],
    ["COMPLETED", "WITHDRAWAL_NOT_BROADCAST_UNKNOWN"],
  ])("rejects %s without changing accounting", async (status, code) => {
    const tx = makeTransaction({ status });

    await expect(
      rejectAndRefundBroadcastUnknown("admin-1", "withdrawal-121", input),
    ).rejects.toMatchObject({ statusCode: 409, code });

    expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
  });

  it("fails closed when any transaction evidence exists", async () => {
    const tx = makeTransaction({ txHash: "0xabc" });

    await expect(
      rejectAndRefundBroadcastUnknown("admin-1", "withdrawal-121", input),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WITHDRAWAL_TRANSACTION_EVIDENCE_EXISTS",
    });

    expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it("returns an idempotent no-op after the guarded refund already exists", async () => {
    const tx = makeTransaction({
      status: "REJECTED",
      existingRefund: {
        id: "wallet-tx-121",
        type: "WITHDRAWAL",
        status: "FAILED",
        amount,
      },
    });

    await expect(
      rejectAndRefundBroadcastUnknown("admin-1", "withdrawal-121", input),
    ).resolves.toEqual({
      withdrawalId: "withdrawal-121",
      status: "REJECTED",
      alreadyReconciled: true,
      refundedAmount: "1.02000000",
    });

    expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
    expect(notificationService.create).not.toHaveBeenCalled();
  });

  it("returns a conflict when another actor wins the conditional state update", async () => {
    const tx = makeTransaction({ stateChanged: 0 });

    await expect(
      rejectAndRefundBroadcastUnknown("admin-1", "withdrawal-121", input),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WITHDRAWAL_RECONCILIATION_RACE",
    });

    expect(tx.wallet.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
  });

  it("does not refund when the aggregate locked balance cannot cover this amount", async () => {
    const tx = makeTransaction({ lockedBalanceChanged: 0 });

    await expect(
      rejectAndRefundBroadcastUnknown("admin-1", "withdrawal-121", input),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "LOCKED_BALANCE_MISMATCH",
    });

    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.adminLog.create).not.toHaveBeenCalled();
    expect(tx.withdrawalEvent.create).not.toHaveBeenCalled();
  });
});