import { AppError }    from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { prisma }      from "../config/prisma";
import { logger }      from "../lib/logger";
import type { Prisma } from "@prisma/client";

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
  return prisma.companyWallet.findMany({
    orderBy: { network: "asc" },
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCompanyWalletAddress(
  adminId:       string,
  id:            string,
  walletAddress: string,
  ip?:           string,
) {
  const existing = await prisma.companyWallet.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Company wallet not found", HTTP_STATUS.NOT_FOUND, "WALLET_NOT_FOUND");
  }

  validateAddressForNetwork(existing.network, walletAddress);

  if (existing.walletAddress === walletAddress) {
    throw new AppError(
      "New wallet address is identical to the current one.",
      HTTP_STATUS.CONFLICT,
      "WALLET_ADDRESS_UNCHANGED",
    );
  }

  const updated = await prisma.companyWallet.update({
    where: { id },
    data:  { walletAddress },
  });

  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action: "COMPANY_WALLET_UPDATED",
        details: {
          walletId:       id,
          network:        existing.network,
          previousAddress: existing.walletAddress,
          newAddress:      walletAddress,
          ...(ip && { ipAddress: ip }),
          timestamp:      new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (auditErr) {
    logger.warn({ auditErr, walletId: id }, "CompanyWallet: audit log failed (non-fatal)");
  }

  logger.info(
    { adminId, walletId: id, network: existing.network, newAddress: walletAddress },
    `CompanyWallet: ${existing.network} wallet address updated`,
  );

  return updated;
}
