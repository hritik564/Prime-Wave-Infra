import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const mocks = vi.hoisted(() => ({
  companyWallet: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  adminLog: { create: vi.fn() },
  admin: { findUnique: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("../../config/env", () => ({
  env: {
    JWT_SECRET: "wallet-test-secret",
  },
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    companyWallet: mocks.companyWallet,
    adminLog: mocks.adminLog,
    admin: mocks.admin,
    $transaction: mocks.transaction,
  },
}));

vi.mock("../../lib/company-wallet-qr", () => ({
  LEGACY_QR_OBJECT_PATH: "/legacy/deposit-wallet-qr",
  QR_CONTENT_TYPE: "image/png",
  QR_MAX_BYTES: 2 * 1024 * 1024,
  createQrUploadUrl: vi.fn(),
  getQrReadUrl: vi.fn().mockResolvedValue("/signed-qr-url"),
  isStoredQrObjectPath: vi.fn((value: string) => /^\/objects\/company-wallet-qr\/.+\.png$/.test(value)),
  verifyQrMatchesAddress: vi.fn().mockResolvedValue(undefined),
}));

import { Prisma } from "@prisma/client";
import {
  activateCompanyWallet,
  createCompanyWallet,
  deleteCompanyWallet,
  updateCompanyWalletAddress,
} from "../admin-company-wallets.service";
import { verifyQrMatchesAddress } from "../../lib/company-wallet-qr";
import { requireAdminRoles } from "../../middleware/auth.middleware";

const address = "0x1111111111111111111111111111111111111111";
const otherAddress = "0x2222222222222222222222222222222222222222";
const qrPath = "/objects/company-wallet-qr/profile.png";

function wallet(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "wallet-1",
    network: "BEP20",
    walletAddress: address,
    qrObjectPath: qrPath,
    isActive: false,
    createdAt: new Date("2026-09-11T00:00:00.000Z"),
    updatedAt: new Date("2026-09-11T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminLog.create.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback: (tx: { companyWallet: typeof mocks.companyWallet }) => unknown) => callback({ companyWallet: mocks.companyWallet }));
});

describe("saved BEP20 deposit wallet profiles", () => {
  it("creates a profile only when an uploaded QR path is supplied", async () => {
    const created = wallet();
    mocks.companyWallet.count.mockResolvedValue(0);
    mocks.companyWallet.create.mockResolvedValue(created);

    const result = await createCompanyWallet("admin-1", address, qrPath);

    expect(result).toMatchObject({ id: "wallet-1", walletAddress: address, qrUrl: "/signed-qr-url" });
    expect(mocks.companyWallet.create).toHaveBeenCalledWith({
      data: { network: "BEP20", walletAddress: address, qrObjectPath: qrPath, isActive: false },
    });
  });

  it("rejects a missing QR and the legacy QR sentinel for newly created profiles", async () => {
    await expect(createCompanyWallet("admin-1", address, "")).rejects.toMatchObject({ code: "INVALID_QR_IMAGE" });
    await expect(createCompanyWallet("admin-1", address, "/legacy/deposit-wallet-qr")).rejects.toMatchObject({ code: "QR_REQUIRED" });
    expect(mocks.companyWallet.count).not.toHaveBeenCalled();
  });

  it("enforces the five-profile limit", async () => {
    mocks.companyWallet.count.mockResolvedValue(5);

    await expect(createCompanyWallet("admin-1", address, qrPath)).rejects.toMatchObject({
      code: "WALLET_LIMIT_REACHED",
      statusCode: 409,
    });
    expect(mocks.companyWallet.create).not.toHaveBeenCalled();
  });

  it("uses the existing BEP20 address validation", async () => {
    await expect(createCompanyWallet("admin-1", "not-an-address", qrPath)).rejects.toMatchObject({
      code: "INVALID_WALLET_ADDRESS",
    });
  });

  it("rejects a QR/address mismatch before saving", async () => {
    vi.mocked(verifyQrMatchesAddress).mockRejectedValueOnce(new Error("QR code does not contain the wallet address"));

    await expect(createCompanyWallet("admin-1", address, qrPath)).rejects.toMatchObject({
      code: "QR_ADDRESS_MISMATCH",
    });
    expect(mocks.companyWallet.create).not.toHaveBeenCalled();
  });

  it("preserves an existing QR when editing only the address is not requested", async () => {
    const existing = wallet();
    const updated = wallet({ walletAddress: otherAddress });
    mocks.companyWallet.findUnique.mockResolvedValue(existing);
    mocks.companyWallet.update.mockResolvedValue(updated);

    await updateCompanyWalletAddress("admin-1", "wallet-1", otherAddress, qrPath);

    expect(mocks.companyWallet.update).toHaveBeenCalledWith({
      where: { id: "wallet-1" },
      data: { walletAddress: otherAddress, qrObjectPath: qrPath },
    });
  });

  it("requires a replacement QR when changing a legacy profile address", async () => {
    mocks.companyWallet.findUnique.mockResolvedValue(wallet({
      qrObjectPath: "/legacy/deposit-wallet-qr",
    }));

    await expect(updateCompanyWalletAddress("admin-1", "wallet-1", otherAddress, undefined)).rejects.toMatchObject({
      code: "QR_REPLACEMENT_REQUIRED",
    });
  });

  it("switches the current profile atomically", async () => {
    mocks.companyWallet.findUnique.mockResolvedValue(wallet());
    mocks.companyWallet.updateMany.mockResolvedValue({ count: 1 });
    mocks.companyWallet.update.mockResolvedValue(wallet({ isActive: true }));

    await activateCompanyWallet("admin-1", "wallet-1");

    expect(mocks.companyWallet.updateMany).toHaveBeenCalledWith({
      where: { network: "BEP20", isActive: true, id: { not: "wallet-1" } },
      data: { isActive: false },
    });
    expect(mocks.companyWallet.update).toHaveBeenCalledWith({
      where: { id: "wallet-1" },
      data: { isActive: true },
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it("allows inactive deletion but protects the current profile", async () => {
    mocks.companyWallet.findUnique.mockResolvedValueOnce(wallet({ isActive: true }));
    await expect(deleteCompanyWallet("admin-1", "wallet-1")).rejects.toMatchObject({
      code: "ACTIVE_WALLET_CANNOT_BE_DELETED",
    });

    mocks.companyWallet.findUnique.mockResolvedValueOnce(wallet({ isActive: false }));
    await deleteCompanyWallet("admin-1", "wallet-1");
    expect(mocks.companyWallet.delete).toHaveBeenCalledWith({ where: { id: "wallet-1" } });
  });
});

describe("deposit wallet management authorization", () => {
  it("rejects a non-Super Admin before a wallet mutation handler can run", async () => {
    const updatedAt = new Date("2026-09-11T00:00:00.000Z");
    mocks.admin.findUnique.mockResolvedValue({
      isActive: true,
      role: "STAFF_OPERATIONS",
      updatedAt,
    });
    const token = jwt.sign({
      sub: "staff-1",
      email: "staff@example.com",
      type: "admin",
      role: "STAFF_OPERATIONS",
      adminUpdatedAt: updatedAt.getTime(),
    }, "wallet-test-secret");
    const next = vi.fn();

    requireAdminRoles("SUPER_ADMIN")(
      { headers: { authorization: `Bearer ${token}` } } as never,
      {} as never,
      next,
    );

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        code: "FORBIDDEN",
        statusCode: 403,
      }));
    });
  });
});