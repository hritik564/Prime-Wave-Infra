import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { DepositHistoryQuery } from "./deposits.schema";
import type { Prisma as PrismaNamespace } from "@prisma/client";
import { getQrReadUrl } from "../lib/company-wallet-qr";

// ── Company wallets ───────────────────────────────────────────────────────────

/** Returns all active company wallets, grouped by network. */
export async function getActiveCompanyWallets() {
  const wallets = await prisma.companyWallet.findMany({
    where:   { isActive: true },
    orderBy: [{ network: "asc" }, { createdAt: "asc" }],
    select:  { id: true, network: true, walletAddress: true, qrObjectPath: true },
  });
  return Promise.all(wallets.map(async (wallet) => ({
    id: wallet.id,
    network: wallet.network,
    walletAddress: wallet.walletAddress,
    qrUrl: await getQrReadUrl(wallet.qrObjectPath),
  })));
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
