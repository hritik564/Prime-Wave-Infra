import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { logger } from "../lib/logger";
import type { AddWalletAddressInput } from "./wallet-addresses.schema";

const LOCK_MESSAGE =
  "Your withdrawal wallet has been permanently locked for security reasons. Please contact PrimeWave Support if you believe this is incorrect.";

const addressSelect = {
  id:         true,
  network:    true,
  address:    true,
  label:      true,
  isVerified: true,
  isPrimary:  true,
  createdAt:  true,
} as const;

export async function listWalletAddresses(userId: string, network?: "BEP20") {
  return prisma.walletAddress.findMany({
    where:   { userId, ...(network ? { network } : {}) },
    select:  addressSelect,
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function addWalletAddress(userId: string, input: AddWalletAddressInput) {
  const { network, address, label } = input;

  const count = await prisma.walletAddress.count({ where: { userId, network } });

  if (count >= 1) {
    logger.warn(
      { userId, address, network, attemptType: "ADD" },
      "wallet.lock: add attempt rejected — wallet permanently locked",
    );
    throw new AppError(LOCK_MESSAGE, HTTP_STATUS.FORBIDDEN, "WALLET_LOCKED");
  }

  const existing = await prisma.walletAddress.findUnique({
    where: { userId_network_address: { userId, network, address } },
  });
  if (existing) {
    throw new AppError(
      "This wallet address is already saved to your account",
      HTTP_STATUS.CONFLICT,
      "WALLET_ADDRESS_EXISTS",
    );
  }

  return prisma.walletAddress.create({
    data:   { userId, network, address, label: label ?? null, isVerified: true, isPrimary: true },
    select: addressSelect,
  });
}

export async function deleteWalletAddress(userId: string, addressId: string) {
  const record = await prisma.walletAddress.findFirst({
    where:  { id: addressId, userId },
    select: { id: true, address: true, network: true },
  });

  if (!record) {
    throw new AppError("Wallet address not found", HTTP_STATUS.NOT_FOUND, "WALLET_ADDRESS_NOT_FOUND");
  }

  logger.warn(
    { userId, addressId, address: record.address, network: record.network, attemptType: "DELETE" },
    "wallet.lock: delete attempt rejected — wallet permanently locked",
  );
  throw new AppError(LOCK_MESSAGE, HTTP_STATUS.FORBIDDEN, "WALLET_LOCKED");
}

export async function setPrimaryWalletAddress(userId: string, addressId: string) {
  const record = await prisma.walletAddress.findFirst({
    where:  { id: addressId, userId },
    select: { id: true, network: true, isVerified: true },
  });

  if (!record) {
    throw new AppError("Wallet address not found", HTTP_STATUS.NOT_FOUND, "WALLET_ADDRESS_NOT_FOUND");
  }
  if (!record.isVerified) {
    throw new AppError(
      "Only verified wallet addresses can be set as primary",
      HTTP_STATUS.BAD_REQUEST,
      "ADDRESS_NOT_VERIFIED",
    );
  }

  await prisma.$transaction([
    prisma.walletAddress.updateMany({
      where: { userId, network: record.network, isPrimary: true },
      data:  { isPrimary: false },
    }),
    prisma.walletAddress.update({
      where: { id: record.id },
      data:  { isPrimary: true },
    }),
  ]);

  return prisma.walletAddress.findUnique({ where: { id: record.id }, select: addressSelect });
}

export async function getVerifiedAddressForUser(
  userId:  string,
  network: "BEP20",
  address: string,
) {
  return prisma.walletAddress.findFirst({
    where: { userId, network, address, isVerified: true },
  });
}
