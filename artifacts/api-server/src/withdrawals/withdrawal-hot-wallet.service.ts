import { getWithdrawalGateway, isGatewayConfigured } from "../services/blockchain/blockchain.factory";
import { logger } from "../lib/logger";

// ── Hot Wallet Protection ─────────────────────────────────────────────────────
//
// Reads live BNB + USDT balances from the blockchain gateway and compares
// them against the configured minimum thresholds.
//
// If either balance is below its threshold:
//   - Automatic processing is paused
//   - An alert is raised in the operational health dashboard
//
// Environment variables:
//   MIN_HOT_WALLET_BNB   (default 0.05) — minimum BNB for gas
//   MIN_HOT_WALLET_USDT  (default 100)  — minimum USDT liquidity

export const BSC_EXPLORER_TX = "https://bscscan.com/tx/";

/** Returns the BSCScan URL for a given txHash. */
export function buildExplorerUrl(txHash: string): string {
  return `${BSC_EXPLORER_TX}${txHash}`;
}

export interface HotWalletStatus {
  configured:      boolean;
  address:         string | null;
  bnbBalance:      string | null;
  usdtBalance:     string | null;
  gasPriceGwei:    string | null;
  bnbSufficient:   boolean;
  usdtSufficient:  boolean;
  isSufficient:    boolean;
  minBnbRequired:  string;
  minUsdtRequired: string;
  alerts:          string[];
  checkedAt:       string;
}

export async function checkHotWalletStatus(): Promise<HotWalletStatus> {
  const minBnb  = parseFloat(process.env["MIN_HOT_WALLET_BNB"]  ?? "0.05");
  const minUsdt = parseFloat(process.env["MIN_HOT_WALLET_USDT"] ?? "1");
  const checkedAt = new Date().toISOString();

  if (!isGatewayConfigured("BEP20")) {
    return {
      configured:      false,
      address:         null,
      bnbBalance:      null,
      usdtBalance:     null,
      gasPriceGwei:    null,
      bnbSufficient:   false,
      usdtSufficient:  false,
      isSufficient:    false,
      minBnbRequired:  String(minBnb),
      minUsdtRequired: String(minUsdt),
      alerts:          ["Blockchain gateway not configured"],
      checkedAt,
    };
  }

  try {
    const gw     = getWithdrawalGateway("BEP20");
    const health = await gw.getHealth();

    const bnbBal  = parseFloat(health.bnbBalance  ?? "0");
    const usdtBal = parseFloat(health.usdtBalance ?? "0");
    const bnbOk   = bnbBal  >= minBnb;
    const usdtOk  = usdtBal >= minUsdt;

    const alerts: string[] = [];
    if (!health.connected) {
      alerts.push("RPC node not reachable — cannot verify hot wallet balances");
    }
    if (bnbOk === false) {
      alerts.push(
        `Low BNB: ${bnbBal.toFixed(6)} BNB available (minimum ${minBnb} BNB required for gas)`,
      );
    }
    if (usdtOk === false) {
      alerts.push(
        `Low USDT: ${usdtBal.toFixed(2)} USDT available (minimum ${minUsdt} USDT required)`,
      );
    }

    if (alerts.length > 0) {
      logger.warn(
        { bnbBal, usdtBal, minBnb, minUsdt, alerts },
        "HotWalletGuard: threshold crossed — processing paused",
      );
    }

    return {
      configured:      true,
      address:         health.hotWalletAddress,
      bnbBalance:      health.bnbBalance,
      usdtBalance:     health.usdtBalance,
      gasPriceGwei:    health.gasPriceGwei,
      bnbSufficient:   bnbOk,
      usdtSufficient:  usdtOk,
      isSufficient:    bnbOk && usdtOk,
      minBnbRequired:  String(minBnb),
      minUsdtRequired: String(minUsdt),
      alerts,
      checkedAt,
    };
  } catch (err) {
    logger.error({ err }, "HotWalletGuard: failed to check balances");
    return {
      configured:      true,
      address:         null,
      bnbBalance:      null,
      usdtBalance:     null,
      gasPriceGwei:    null,
      bnbSufficient:   false,
      usdtSufficient:  false,
      isSufficient:    false,
      minBnbRequired:  String(minBnb),
      minUsdtRequired: String(minUsdt),
      alerts:          ["Failed to query hot wallet balances — processing paused as a safety measure"],
      checkedAt,
    };
  }
}
