import { prisma } from "../config/prisma";
import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { checkHotWalletStatus } from "./withdrawal-hot-wallet.service";

export interface WithdrawalActivationGate {
  allowed: boolean;
  liveMode: boolean;
  reasons: string[];
}

async function isProductionSchemaReady(): Promise<boolean> {
  const requiredColumns = [
    "status",
    "requestedAt",
    "withdrawalId",
    "claimOwner",
    "claimToken",
    "claimExpiresAt",
    "broadcastUnknownAt",
    "broadcastUnknownReason",
  ];

  try {
    const [columns, ledgerIndex] = await Promise.all([
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'withdrawal_requests'
          AND column_name IN (
            'status',
            'requestedAt',
            'withdrawalId',
            'claimOwner',
            'claimToken',
            'claimExpiresAt',
            'broadcastUnknownAt',
            'broadcastUnknownReason'
          )
      `,
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS "count"
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'wallet_transactions'
          AND indexdef ILIKE '%withdrawalRequestId%'
      `,
    ]);
    return Number(columns[0]?.count ?? 0) === requiredColumns.length &&
      Number(ledgerIndex[0]?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function countUnresolvedBlockchainReviews(): Promise<{
  broadcastUnknown: number;
  manualReview: number;
}> {
  const [broadcastUnknown, manualReview] = await Promise.all([
    prisma.withdrawalRequest.count({ where: { status: "BROADCAST_UNKNOWN" } }),
    prisma.withdrawalRequest.count({ where: { status: "MANUAL_REVIEW" } }),
  ]);
  return { broadcastUnknown, manualReview };
}

/**
 * Live-mode safety gate. Dry-run remains available for non-financial testing,
 * while live processing must prove every required operational condition.
 */
export async function evaluateWithdrawalActivationGate(): Promise<WithdrawalActivationGate> {
  const liveMode = process.env["BLOCKCHAIN_DRY_RUN"] === "false";
  if (!liveMode) {
    return { allowed: true, liveMode: false, reasons: [] };
  }

  const reasons: string[] = [];
  if (!process.env["HOT_WALLET_ADDRESS"]) reasons.push("HOT_WALLET_ADDRESS is missing");
  if (!process.env["HOT_WALLET_PRIVATE_KEY"]) reasons.push("HOT_WALLET_PRIVATE_KEY is missing");
  if (reasons.length > 0) {
    return { allowed: false, liveMode: true, reasons };
  }

  try {
    if (!(await isProductionSchemaReady())) {
      reasons.push("Production withdrawal schema readiness check failed");
    }

    const unresolved = await countUnresolvedBlockchainReviews();
    if (unresolved.broadcastUnknown > 0) {
      reasons.push(`${unresolved.broadcastUnknown} BROADCAST_UNKNOWN withdrawal(s) require reconciliation`);
    }
    if (unresolved.manualReview > 0) {
      reasons.push(`${unresolved.manualReview} MANUAL_REVIEW withdrawal(s) require reconciliation`);
    }

    if (!isGatewayConfigured("BEP20")) {
      reasons.push("BEP20 blockchain gateway is not configured");
      return { allowed: false, liveMode: true, reasons };
    }

    const gateway = getWithdrawalGateway("BEP20");
    const [readiness, wallet] = await Promise.all([
      gateway.getActivationReadiness(),
      checkHotWalletStatus(),
    ]);

    if (!readiness.ready) {
      reasons.push("Blockchain activation readiness check failed");
    }
    reasons.push(...readiness.errors);
    if (!wallet.bnbSufficient) reasons.push(`BNB balance is below ${wallet.minBnbRequired}`);
    if (!wallet.usdtSufficient) reasons.push(`USDT balance is below ${wallet.minUsdtRequired}`);
  } catch {
    reasons.push("Activation readiness check failed closed");
  }

  return {
    allowed: reasons.length === 0,
    liveMode: true,
    reasons: [...new Set(reasons)],
  };
}