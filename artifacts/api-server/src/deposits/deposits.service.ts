import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { DepositHistoryQuery } from "./deposits.schema";
import type { Prisma as PrismaNamespace } from "@prisma/client";
import { downloadQrObject, LEGACY_QR_OBJECT_PATH } from "../lib/company-wallet-qr";

// ── Company wallets ───────────────────────────────────────────────────────────

/** Returns all active company wallets, grouped by network. */
export async function getActiveCompanyWallets() {
  const wallets = await prisma.companyWallet.findMany({
    where:   { isActive: true },
    orderBy: [{ network: "asc" }, { createdAt: "asc" }],
    select:  { id: true, network: true, walletAddress: true, qrObjectPath: true },
  });
  return wallets.map((wallet) => ({
    id: wallet.id,
    network: wallet.network,
    walletAddress: wallet.walletAddress,
    qrUrl: wallet.qrObjectPath === LEGACY_QR_OBJECT_PATH
      ? null
      : `/api/deposits/wallets/${encodeURIComponent(wallet.id)}/qr`,
  }));
}

export async function getCompanyWalletQrObject(walletId: string, activeOnly: boolean): Promise<Buffer> {
  const wallet = await prisma.companyWallet.findFirst({
    where: {
      id: walletId,
      network: "BEP20",
      ...(activeOnly && { isActive: true }),
    },
    select: { qrObjectPath: true },
  });

  if (!wallet || wallet.qrObjectPath === LEGACY_QR_OBJECT_PATH) {
    throw new AppError("Deposit wallet QR image not found", HTTP_STATUS.NOT_FOUND, "QR_NOT_FOUND");
  }

  try {
    return await downloadQrObject(wallet.qrObjectPath);
  } catch {
    throw new AppError("Deposit wallet QR image is unavailable", HTTP_STATUS.NOT_FOUND, "QR_NOT_FOUND");
  }
}

// ── Deposit history ───────────────────────────────────────────────────────────

export async function getDepositHistory(
  userId: string,
  query:  DepositHistoryQuery,
) {
  const { page, limit, status, network } = query;
  const skip = (page - 1) * limit;

  const where: PrismaNamespace.DepositRequestWhereInput = {
    userId,
    ...(status  && { status }),
    ...(network && { network }),
  };

  const [records, total] = await prisma.$transaction([
    prisma.depositRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
      select:  depositSelect,
    }),
    prisma.depositRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: records,
    meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
}

// ── Single deposit ────────────────────────────────────────────────────────────

export async function getDepositById(userId: string, depositId: string) {
  const deposit = await prisma.depositRequest.findFirst({
    where:  { id: depositId, userId },
    select: depositDetailSelect,
  });

  if (!deposit) {
    throw new AppError("Deposit not found", HTTP_STATUS.NOT_FOUND, "DEPOSIT_NOT_FOUND");
  }
  return deposit;
}

// ── Selects ───────────────────────────────────────────────────────────────────

const depositSelect = {
  id:            true,
  amount:        true,
  network:       true,
  txHash:        true,
  screenshotUrl: true,
  companyWallet: true,
  status:        true,
  approvedAt:    true,
  rejectedReason: true,
  createdAt:     true,
} as const;

const depositDetailSelect = {
  ...depositSelect,
  approver: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const;
