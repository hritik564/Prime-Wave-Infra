import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    manualDepositIdempotency: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    wallet: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  notificationCreate: vi.fn(),
  writeLedgerEntry: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../../notifications/notifications.service", () => ({
  notificationService: { create: mocks.notificationCreate },
}));
vi.mock("../../ledger/ledger.service", () => ({
  writeLedgerEntry: mocks.writeLedgerEntry,
}));
vi.mock("../../lib/logger", () => ({
  logger: { error: mocks.loggerError },
}));

import {
  createManualAdminDeposit,
  creditUserWallet,
} from "../admin-deposits.service";

const tx = {
  depositRequest: { create: vi.fn() },
  wallet: { update: vi.fn() },
  walletTransaction: { create: vi.fn() },
  adminLog: { create: vi.fn() },
  manualDepositIdempotency: { create: vi.fn() },
};

const input = {
  userId: "user-1",
  amount: 25,
  network: "BEP20" as const,
  reason: "Manual correction",
  notes: "Approved by finance",
};

function configureSuccessfulTransaction(depositId = "deposit-1") {
  tx.depositRequest.create.mockResolvedValue({ id: depositId });
  tx.wallet.update.mockResolvedValue({
    id: "wallet-1",
    depositWallet: new Prisma.Decimal("125"),
  });
  tx.walletTransaction.create.mockResolvedValue({ id: "wallet-tx-1" });
  tx.adminLog.create.mockResolvedValue({ id: "admin-log-1" });
  tx.manualDepositIdempotency.create.mockResolvedValue({ id: "idempotency-1" });
  mocks.prisma.$transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<void>) => callback(tx));
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  const error = Object.create(Prisma.PrismaClientKnownRequestError.prototype) as Prisma.PrismaClientKnownRequestError;
  Object.assign(error, { code: "P2002" });
  return error;
}

describe("manual deposit idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-1", username: "alice" });
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(null);
    mocks.prisma.wallet.findUnique.mockResolvedValue({
      depositWallet: new Prisma.Decimal("125"),
    });
    mocks.notificationCreate.mockResolvedValue(undefined);
    mocks.writeLedgerEntry.mockResolvedValue(undefined);
    configureSuccessfulTransaction();
  });

  it("commits the idempotency record with the first manual deposit", async () => {
    const result = await createManualAdminDeposit("admin-1", input, "127.0.0.1", "key-1");

    expect(result).toMatchObject({
      depositId: "deposit-1",
      userId: "user-1",
      amount: "25.00",
      network: "BEP20",
    });
    expect(tx.depositRequest.create).toHaveBeenCalledTimes(1);
    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.adminLog.create).toHaveBeenCalledTimes(1);
    expect(tx.manualDepositIdempotency.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: "admin-1",
        idempotencyKey: "key-1",
        depositId: "deposit-1",
        userId: "user-1",
      }),
    });
  });

  it("replays the original result without a second financial operation", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "key-1");
    const record = tx.manualDepositIdempotency.create.mock.calls[0][0].data;
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(record);
    mocks.prisma.$transaction.mockClear();
    mocks.notificationCreate.mockClear();
    mocks.writeLedgerEntry.mockClear();

    const result = await createManualAdminDeposit("admin-1", input, undefined, "key-1");

    expect(result).toMatchObject({ depositId: "deposit-1", amount: "25.00" });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.depositRequest.create).toHaveBeenCalledTimes(1);
    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.adminLog.create).toHaveBeenCalledTimes(1);
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.writeLedgerEntry).not.toHaveBeenCalled();
  });

  it("rejects reuse of a key with a materially different payload", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "key-1");
    const record = tx.manualDepositIdempotency.create.mock.calls[0][0].data;
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(record);

    await expect(createManualAdminDeposit(
      "admin-1",
      { ...input, amount: 30 },
      undefined,
      "key-1",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of a key with a different target user", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "target-key");
    const record = tx.manualDepositIdempotency.create.mock.calls[0][0].data;
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(record);

    await expect(createManualAdminDeposit(
      "admin-1",
      { ...input, userId: "user-2" },
      undefined,
      "target-key",
    )).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects reuse of a key with a different network", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "network-key");
    const record = tx.manualDepositIdempotency.create.mock.calls[0][0].data;
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(record);

    await expect(createManualAdminDeposit(
      "admin-1",
      { ...input, network: "ERC20" },
      undefined,
      "network-key",
    )).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects reuse of a key with a different reason", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "reason-key");
    const record = tx.manualDepositIdempotency.create.mock.calls[0][0].data;
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(record);

    await expect(createManualAdminDeposit(
      "admin-1",
      { ...input, reason: "Different reason" },
      undefined,
      "reason-key",
    )).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects reuse of a key with different notes", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "notes-key");
    const record = tx.manualDepositIdempotency.create.mock.calls[0][0].data;
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(record);

    await expect(createManualAdminDeposit(
      "admin-1",
      { ...input, notes: "Different notes" },
      undefined,
      "notes-key",
    )).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("lets a failed transaction retry with the same key", async () => {
    mocks.prisma.$transaction
      .mockRejectedValueOnce(new Error("transaction rolled back"))
      .mockImplementationOnce(async (callback: (value: typeof tx) => Promise<void>) => callback(tx));

    await expect(createManualAdminDeposit("admin-1", input, undefined, "retry-key"))
      .rejects.toThrow("transaction rolled back");

    const result = await createManualAdminDeposit("admin-1", input, undefined, "retry-key");
    expect(result.depositId).toBe("deposit-1");
    expect(tx.depositRequest.create).toHaveBeenCalledTimes(1);
    expect(tx.manualDepositIdempotency.create).toHaveBeenCalledTimes(1);
  });

  it("handles a concurrent unique-key race by replaying the committed operation", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "race-key");
    const record = tx.manualDepositIdempotency.create.mock.calls[0][0].data;
    mocks.prisma.manualDepositIdempotency.findUnique
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record);
    mocks.prisma.$transaction.mockReset().mockRejectedValueOnce(uniqueConstraintError());

    const result = await createManualAdminDeposit("admin-1", input, undefined, "race-key");

    expect(result.depositId).toBe("deposit-1");
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.depositRequest.create).toHaveBeenCalledTimes(1);
    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
  });

  it("scopes keys per operator so another admin cannot replay the first admin's result", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "scoped-key");
    tx.depositRequest.create.mockResolvedValue({ id: "deposit-2" });
    mocks.prisma.manualDepositIdempotency.findUnique.mockResolvedValue(null);

    await createManualAdminDeposit("admin-2", input, undefined, "scoped-key");

    expect(tx.depositRequest.create).toHaveBeenCalledTimes(2);
    expect(tx.wallet.update).toHaveBeenCalledTimes(2);
    expect(tx.manualDepositIdempotency.create).toHaveBeenCalledTimes(2);
  });

  it("allows a new key to create a legitimate new manual deposit", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "key-1");
    tx.depositRequest.create.mockResolvedValue({ id: "deposit-2" });
    await createManualAdminDeposit("admin-1", input, undefined, "key-2");

    expect(tx.depositRequest.create).toHaveBeenCalledTimes(2);
    expect(tx.wallet.update).toHaveBeenCalledTimes(2);
    expect(tx.manualDepositIdempotency.create).toHaveBeenCalledTimes(2);
  });

  it("protects the shared deposit-wallet credit endpoint with the same mechanism", async () => {
    const result = await creditUserWallet(
      "admin-1",
      {
        userId: "user-1",
        walletType: "depositWallet",
        amount: 25,
        reason: "Manual correction",
      },
      undefined,
      "shared-endpoint-key",
    );

    expect(result).toMatchObject({ userId: "user-1", walletType: "depositWallet" });
    expect(tx.manualDepositIdempotency.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: "shared-endpoint-key",
        network: "BEP20",
      }),
    });
  });

  it("rejects an idempotency key on a non-deposit wallet credit", async () => {
    await expect(creditUserWallet(
      "admin-1",
      {
        userId: "user-1",
        walletType: "incomeWallet",
        amount: 25,
        reason: "Manual correction",
      },
      undefined,
      "key-1",
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_WALLET_MISMATCH",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a stored manual-deposit key when the wallet type changes", async () => {
    await createManualAdminDeposit("admin-1", input, undefined, "wallet-type-key");

    await expect(creditUserWallet(
      "admin-1",
      {
        userId: "user-1",
        walletType: "withdrawalWallet",
        amount: 25,
        reason: "Manual correction",
      },
      undefined,
      "wallet-type-key",
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_WALLET_MISMATCH",
    });
  });

  it("rejects a blank idempotency key before starting a database operation", async () => {
    await expect(createManualAdminDeposit("admin-1", input, undefined, "   "))
      .rejects.toMatchObject({ statusCode: 400, code: "IDEMPOTENCY_KEY_INVALID" });
    expect(mocks.prisma.manualDepositIdempotency.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an idempotency key longer than the supported header limit", async () => {
    await expect(createManualAdminDeposit("admin-1", input, undefined, "x".repeat(256)))
      .rejects.toMatchObject({ statusCode: 400, code: "IDEMPOTENCY_KEY_INVALID" });
    expect(mocks.prisma.manualDepositIdempotency.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});