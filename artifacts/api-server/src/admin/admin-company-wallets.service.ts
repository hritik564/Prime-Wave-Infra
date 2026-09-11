import { AppError }    from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { prisma }      from "../config/prisma";
import { logger }      from "../lib/logger";
import { Prisma, type Prisma as PrismaNamespace } from "@prisma/client";
import {
  createStoredQrObjectPath,
  getQrReadUrl,
  isStoredQrObjectPath,
  LEGACY_QR_OBJECT_PATH,
  QR_MAX_BYTES,
  uploadQrObject,
} from "../lib/company-wallet-qr";

// ── Network-specific address validators ───────────────────────────────────────
const ADDRESS_PATTERNS: Record<string, RegExp> = {
  BEP20: /^0x[0-9a-fA-F]{40}$/,
  ERC20: /^0x[0-9a-fA-F]{40}$/,
  TRC20: /^T[a-zA-Z0-9]{33}$/,
  SOL:   /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

function validateAddressForNetwork(network: string, address: string): void {
  const pattern = ADDRESS_PATTERNS[network];
  if (!pattern) return; // unknown network — allow, admin knows what they're doing
  if (!pattern.test(address)) {
    throw new AppError(
      `Invalid wallet address format for ${network}. ` +
        (network === "BEP20" || network === "ERC20"
          ? "Expected 0x followed by 40 hex characters."
          : network === "TRC20"
          ? "Expected T followed by 33 alphanumeric characters."
          : "Expected a valid Solana base58 public key."),
      HTTP_STATUS.BAD_REQUEST,
      "INVALID_WALLET_ADDRESS",
    );
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listCompanyWallets() {
  const wallets = await prisma.companyWallet.findMany({
    where: { network: "BEP20" },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return Promise.all(wallets.map(serializeCompanyWallet));
}

async function serializeCompanyWallet(wallet: {
  id: string;
  network: string;
  walletAddress: string;
  qrObjectPath: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...wallet,
    qrUrl: await getQrReadUrl(wallet.qrObjectPath),
  };
}

export function validateBep20Address(walletAddress: string): void {
  validateAddressForNetwork("BEP20", walletAddress);
}

function validateQrPath(qrObjectPath: string): void {
  if (qrObjectPath !== LEGACY_QR_OBJECT_PATH && !isStoredQrObjectPath(qrObjectPath)) {
    throw new AppError("QR image must be uploaded through the wallet manager", HTTP_STATUS.BAD_REQUEST, "INVALID_QR_IMAGE");
  }
}

async function auditWalletChange(
  adminId: string,
  action: string,
  details: PrismaNamespace.InputJsonValue,
): Promise<void> {
  try {
    await prisma.adminLog.create({ data: { adminId, action, details } });
  } catch (auditErr) {
    logger.warn({ auditErr, action }, "CompanyWallet: audit log failed (non-fatal)");
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadCompanyWalletQr(
  _walletAddress: string,
  bytes: Buffer,
): Promise<string> {
  if (bytes.length === 0 || bytes.length > QR_MAX_BYTES) {
    throw new AppError("QR image must be between 1 byte and 2 MB.", HTTP_STATUS.UNPROCESSABLE_ENTITY, "INVALID_QR_IMAGE_SIZE");
  }

  const objectPath = createStoredQrObjectPath();
  try {
    await uploadQrObject(objectPath, bytes);
  } catch {
    throw new AppError("QR upload failed. Please try again.", HTTP_STATUS.BAD_REQUEST, "QR_UPLOAD_FAILED");
  }

  return objectPath;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCompanyWallet(
  adminId: string,
  walletAddress: string,
  qrObjectPath: string,
  ip?: string,
) {
  validateBep20Address(walletAddress);
  validateQrPath(qrObjectPath);
  if (qrObjectPath === LEGACY_QR_OBJECT_PATH) {
    throw new AppError("A newly saved wallet must include an uploaded QR image.", HTTP_STATUS.BAD_REQUEST, "QR_REQUIRED");
  }
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const count = await tx.companyWallet.count({ where: { network: "BEP20" } });
      if (count >= 5) {
        throw new AppError("A maximum of 5 BEP20 deposit wallets is allowed.", HTTP_STATUS.CONFLICT, "WALLET_LIMIT_REACHED");
      }
      return tx.companyWallet.create({
        data: { network: "BEP20", walletAddress, qrObjectPath, isActive: false },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if ((err as { code?: string })?.code === "P2002") {
      throw new AppError("This BEP20 wallet address is already saved.", HTTP_STATUS.CONFLICT, "WALLET_ALREADY_EXISTS");
    }
    throw err;
  }

  await auditWalletChange(adminId, "COMPANY_WALLET_CREATED", {
    walletId: created.id,
    network: created.network,
    walletAddress: created.walletAddress,
    ...(ip && { ipAddress: ip }),
    timestamp: new Date().toISOString(),
  });
  return serializeCompanyWallet(created);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCompanyWalletAddress(
  adminId:       string,
  id:            string,
  walletAddress: string | undefined,
  qrObjectPath: string | undefined,
  ip?:           string,
) {
  const existing = await prisma.companyWallet.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Company wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }
  if (existing.network !== "BEP20") {
    throw new AppError("Only BEP20 deposit wallets can be managed here.", HTTP_STATUS.BAD_REQUEST, "UNSUPPORTED_WALLET_NETWORK");
  }

  const nextAddress = walletAddress ?? existing.walletAddress;
  const nextQrPath = qrObjectPath ?? existing.qrObjectPath;
  validateBep20Address(nextAddress);
  validateQrPath(nextQrPath);

  if (existing.walletAddress === nextAddress && existing.qrObjectPath === nextQrPath) {
    throw new AppError(
      "No wallet changes were supplied.",
      HTTP_STATUS.CONFLICT,
      "WALLET_ADDRESS_UNCHANGED",
    );
  }

  if (nextQrPath === LEGACY_QR_OBJECT_PATH && nextAddress !== existing.walletAddress) {
    throw new AppError(
      "A replacement QR image is required when changing the address.",
      HTTP_STATUS.BAD_REQUEST,
      "QR_REPLACEMENT_REQUIRED",
    );
  }

  let updated;
  try {
    updated = await prisma.companyWallet.update({
      where: { id },
      data: { walletAddress: nextAddress, qrObjectPath: nextQrPath },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      throw new AppError("This BEP20 wallet address is already saved.", HTTP_STATUS.CONFLICT, "WALLET_ALREADY_EXISTS");
    }
    throw err;
  }

  await auditWalletChange(adminId, "COMPANY_WALLET_UPDATED", {
    walletId: id,
    network: existing.network,
    previousAddress: existing.walletAddress,
    newAddress: nextAddress,
    previousQrObjectPath: existing.qrObjectPath,
    newQrObjectPath: nextQrPath,
    ...(ip && { ipAddress: ip }),
    timestamp: new Date().toISOString(),
  });
  logger.info(
    { adminId, walletId: id, network: existing.network },
    `CompanyWallet: ${existing.network} wallet profile updated`,
  );

  return serializeCompanyWallet(updated);
}

export async function activateCompanyWallet(adminId: string, id: string, ip?: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const wallet = await tx.companyWallet.findUnique({ where: { id } });
    if (!wallet) {
      throw new AppError("Company wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
    }
    if (wallet.network !== "BEP20") {
      throw new AppError("Only BEP20 deposit wallets can be activated.", HTTP_STATUS.BAD_REQUEST, "UNSUPPORTED_WALLET_NETWORK");
    }
    await tx.companyWallet.updateMany({
      where: { network: "BEP20", isActive: true, id: { not: id } },
      data: { isActive: false },
    });
    return tx.companyWallet.update({ where: { id }, data: { isActive: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await auditWalletChange(adminId, "COMPANY_WALLET_ACTIVATED", {
    walletId: id,
    network: updated.network,
    walletAddress: updated.walletAddress,
    ...(ip && { ipAddress: ip }),
    timestamp: new Date().toISOString(),
  });
  return serializeCompanyWallet(updated);
}

export async function deleteCompanyWallet(adminId: string, id: string, ip?: string) {
  const existing = await prisma.companyWallet.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Company wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }
  if (existing.network !== "BEP20") {
    throw new AppError("Only BEP20 deposit wallets can be deleted here.", HTTP_STATUS.BAD_REQUEST, "UNSUPPORTED_WALLET_NETWORK");
  }
  if (existing.isActive) {
    throw new AppError("The current wallet cannot be deleted.", HTTP_STATUS.CONFLICT, "ACTIVE_WALLET_CANNOT_BE_DELETED");
  }

  await prisma.companyWallet.delete({ where: { id } });
  await auditWalletChange(adminId, "COMPANY_WALLET_DELETED", {
    walletId: id,
    network: existing.network,
    walletAddress: existing.walletAddress,
    ...(ip && { ipAddress: ip }),
    timestamp: new Date().toISOString(),
  });
}
