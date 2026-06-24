import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import type { CreateDepositInput, DepositHistoryQuery } from "./deposits.schema";

// ── Company wallets ───────────────────────────────────────────────────────────

/** Returns all active company wallets, grouped by network. */
export async function getActiveCompanyWallets() {
  const wallets = await prisma.companyWallet.findMany({
    where:   { isActive: true },
    orderBy: [{ network: "asc" }, { createdAt: "asc" }],
    select:  { id: true, network: true, walletAddress: true },
  });
  return wallets;
}

// ── Create deposit request ────────────────────────────────────────────────────

/**
 * Validates the deposit request and creates a DepositRequest in PENDING status.
 *
 * Minimum deposit = (approvedDepositCount + 1) × $100
 * Amount must be a multiple of $100.
 * txHash must be globally unique.
 */
export async function createDepositRequest(
  userId: string,
  input:  CreateDepositInput,
) {
  const decimalAmount = new Prisma.Decimal(input.amount);

  // ── Minimum deposit check ─────────────────────────────────────────────────
  const approvedCount = await prisma.depositRequest.count({
    where: { userId, status: "APPROVED" },
  });
  const minimumDeposit = new Prisma.Decimal((approvedCount + 1) * 100);

  if (decimalAmount.lt(minimumDeposit)) {
    throw new AppError(
      `Minimum deposit is $${minimumDeposit.toFixed(0)} (deposit #${approvedCount + 1})`,
      HTTP_STATUS.BAD_REQUEST,
      "BELOW_MINIMUM_DEPOSIT",
    );
  }

  // ── Amount multiple of $100 (belt-and-suspenders, Zod also validates) ─────
  if (!decimalAmount.modulo(100).isZero()) {
    throw new AppError(
      "Amount must be a multiple of $100",
      HTTP_STATUS.BAD_REQUEST,
      "INVALID_AMOUNT",
    );
  }

  // ── Create deposit request — txHash unique enforced by DB ─────────────────
  try {
    const deposit = await prisma.depositRequest.create({
      data: {
        userId,
        amount:       decimalAmount,
        network:      input.network,
        txHash:       input.txHash,
        screenshotUrl: input.screenshotUrl ?? null,
        companyWallet: input.companyWallet,
        status:       "PENDING",
      },
      select: depositSelect,
    });
    return deposit;
  } catch (err: unknown) {
    if (isPrismaUniqueViolation(err)) {
      throw new AppError(
        "Transaction hash already exists — deposit may have been submitted already",
        HTTP_STATUS.CONFLICT,
        "DUPLICATE_TX_HASH",
      );
    }
    throw err;
  }
}

// ── Deposit history ───────────────────────────────────────────────────────────

export async function getDepositHistory(
  userId: string,
  query:  DepositHistoryQuery,
) {
  const { page, limit, status, network } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.DepositRequestWhereInput = {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null &&
    "code" in err && (err as Record<string, unknown>)["code"] === "P2002"
  );
}
