// ── Admin Blockchain Controller ────────────────────────────────────────────────
//
// Health monitoring and dry-run testing endpoints for the withdrawal
// blockchain gateway. All operations are read-only or simulation-only.
// No transactions are signed or broadcast here.

import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../shared/response";
import { AppError } from "../middleware/error.middleware";
import { HTTP_STATUS } from "../shared/constants";
import { getWithdrawalGateway, isGatewayConfigured, getAllGateways } from "../services/blockchain/blockchain.factory";
import { logger } from "../lib/logger";
import type { WithdrawalGatewayNetwork } from "../services/blockchain/blockchain.types";

// ── GET /admin/blockchain/health ───────────────────────────────────────────────

export async function getBlockchainHealthHandler(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const gateways = getAllGateways();
    if (gateways.length === 0) {
      sendSuccess(res, {
        configured: false,
        message: "No blockchain gateways configured (set BSC_RPC_PRIMARY to enable)",
        networks: [],
      }, "Blockchain health retrieved");
      return;
    }

    const snapshots = await Promise.allSettled(
      gateways.map((gw) => gw.getHealth()),
    );

    const results = snapshots.map((s, i) => {
      if (s.status === "fulfilled") return s.value;
      logger.error({ err: s.reason, gateway: gateways[i].network }, "admin.blockchain: health check failed");
      return {
        connected:        false,
        network:          gateways[i].network,
        chainId:          0,
        latestBlock:      null,
        hotWalletAddress: null,
        bnbBalance:       null,
        usdtBalance:      null,
        gasPriceGwei:     null,
        rpcLatencyMs:     null,
        dryRunMode:       gateways[i].isDryRun,
        checkedAt:        new Date().toISOString(),
        error:            s.reason instanceof Error ? s.reason.message : String(s.reason),
      };
    });

    sendSuccess(res, { configured: true, networks: results }, "Blockchain health retrieved");
  } catch (err) { next(err); }
}

// ── POST /admin/blockchain/validate-address ────────────────────────────────────

export async function validateAddressHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { address, network = "BEP20" } = req.body as { address?: string; network?: string };

    if (!address) {
      throw new AppError("address is required", HTTP_STATUS.BAD_REQUEST);
    }
    if (!isGatewayConfigured(network as WithdrawalGatewayNetwork)) {
      throw new AppError(`Gateway not configured for network: ${network}`, HTTP_STATUS.BAD_REQUEST);
    }

    const gw     = getWithdrawalGateway(network as WithdrawalGatewayNetwork);
    const result = gw.validateAddress(address);
    logger.info({ address, network, valid: result.valid }, "admin.blockchain: address validation");
    sendSuccess(res, result, "Address validated");
  } catch (err) { next(err); }
}

// ── POST /admin/blockchain/check-balance ──────────────────────────────────────

export async function checkBalanceHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { address, network = "BEP20" } = req.body as { address?: string; network?: string };

    if (!address) {
      throw new AppError("address is required", HTTP_STATUS.BAD_REQUEST);
    }
    if (!isGatewayConfigured(network as WithdrawalGatewayNetwork)) {
      throw new AppError(`Gateway not configured for network: ${network}`, HTTP_STATUS.BAD_REQUEST);
    }

    const gw = getWithdrawalGateway(network as WithdrawalGatewayNetwork);
    const [native, token] = await Promise.all([
      gw.getNativeBalance(address),
      gw.getTokenBalance(address),
    ]);

    logger.info(
      { address, network, bnb: native.formatted, usdt: token.formatted },
      "admin.blockchain: balance check",
    );
    sendSuccess(res, { address, network, native, token }, "Balance retrieved");
  } catch (err) { next(err); }
}

// ── POST /admin/blockchain/estimate-gas ───────────────────────────────────────

export async function estimateGasHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { to, amount, network = "BEP20" } = req.body as {
      to?: string; amount?: string; network?: string;
    };

    if (!to)     throw new AppError("to is required",     HTTP_STATUS.BAD_REQUEST);
    if (!amount) throw new AppError("amount is required", HTTP_STATUS.BAD_REQUEST);

    if (!isGatewayConfigured(network as WithdrawalGatewayNetwork)) {
      throw new AppError(`Gateway not configured for network: ${network}`, HTTP_STATUS.BAD_REQUEST);
    }

    const gw     = getWithdrawalGateway(network as WithdrawalGatewayNetwork);
    const result = await gw.estimateFee(to, amount);

    sendSuccess(res, {
      to,
      amount,
      network,
      estimatedGas:    result.estimatedGas.toString(),
      gasPriceGwei:    (Number(result.gasPriceWei) / 1e9).toFixed(2),
      estimatedFeeBnb: result.estimatedFeeBnb,
      estimatedFeeUsd: result.estimatedFeeUsd,
    }, "Gas estimated");
  } catch (err) { next(err); }
}

// ── POST /admin/blockchain/simulate ───────────────────────────────────────────

export async function simulateTransferHandler(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const { to, amount, withdrawalId = "SIM-DRY-RUN", network = "BEP20" } = req.body as {
      to?: string; amount?: string; withdrawalId?: string; network?: string;
    };

    if (!to)     throw new AppError("to is required",     HTTP_STATUS.BAD_REQUEST);
    if (!amount) throw new AppError("amount is required", HTTP_STATUS.BAD_REQUEST);

    if (!isGatewayConfigured(network as WithdrawalGatewayNetwork)) {
      throw new AppError(`Gateway not configured for network: ${network}`, HTTP_STATUS.BAD_REQUEST);
    }

    const gw      = getWithdrawalGateway(network as WithdrawalGatewayNetwork);

    // Validate destination address first
    const addrCheck = gw.validateAddress(to);
    if (!addrCheck.valid) {
      throw new AppError(`Invalid ${network} address: ${addrCheck.reason}`, HTTP_STATUS.BAD_REQUEST);
    }

    if (!process.env["HOT_WALLET_ADDRESS"]) {
      throw new AppError(
        "HOT_WALLET_ADDRESS environment variable is not set. Configure it to enable transfer simulation.",
        HTTP_STATUS.SERVICE_UNAVAILABLE,
      );
    }

    const prepared = await gw.prepareTransfer(to, amount, withdrawalId);
    logger.info(
      { to, amount, network, withdrawalId, dryRun: prepared.dryRun },
      "admin.blockchain: simulate transfer (DRY RUN)",
    );
    sendSuccess(res, prepared, "Transfer simulated (dry run — no funds moved)");
  } catch (err) { next(err); }
}
