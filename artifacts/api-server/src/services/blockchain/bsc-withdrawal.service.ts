// ── BSC Withdrawal Gateway ─────────────────────────────────────────────────────
//
// Implements IWithdrawalGateway for Binance Smart Chain (BEP20 / USDT).
//
// Uses the shared BscRpcClient (pure fetch, no ethers.js) and BscConfig
// already proven in the deposit verification layer.
//
// RESTRICTIONS:
//   - broadcastTransfer() always throws GatewayDryRunError in Sprint 31B.
//   - prepareTransfer() returns unsigned calldata only.
//   - No private key is ever imported, used, or logged here.

import { BscRpcClient } from "../../deposit-verification/adapter/bsc/bsc-rpc-client";
import type { BscConfig } from "../../deposit-verification/adapter/bsc/bsc-config";
import { logger } from "../../lib/logger";
import { GatewayDryRunError } from "./blockchain.interface";
import type { IWithdrawalGateway } from "./blockchain.interface";
import type {
  AddressValidation,
  BalanceResult,
  BlockchainHealthSnapshot,
  ChainTransaction,
  FeeEstimate,
  PreparedTransfer,
} from "./blockchain.types";

// ── ABI helpers ───────────────────────────────────────────────────────────────

/** ERC-20 transfer(address,uint256) selector */
const TRANSFER_SELECTOR = "0xa9059cbb";

/** ERC-20 balanceOf(address) selector */
const BALANCE_OF_SELECTOR = "0x70a08231";

/** Pad a hex string (without 0x) to 32 bytes */
function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

/** Encode ERC-20 transfer calldata */
function encodeTransfer(to: string, amountWei: bigint): string {
  const toHex    = pad32(to.toLowerCase().replace("0x", ""));
  const amtHex   = pad32(amountWei.toString(16));
  return `${TRANSFER_SELECTOR}${toHex}${amtHex}`;
}

/** Encode ERC-20 balanceOf calldata */
function encodeBalanceOf(address: string): string {
  const addrHex = pad32(address.toLowerCase().replace("0x", ""));
  return `${BALANCE_OF_SELECTOR}${addrHex}`;
}

/** Convert wei (bigint) to a formatted decimal string with `decimals` places */
function weiToDecimal(wei: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  const whole  = wei / factor;
  const frac   = wei % factor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0";
  return `${whole}.${fracStr}`;
}

/** Parse a hex string result from eth_call or eth_getBalance to bigint */
function hexToBigInt(hex: string | null | undefined): bigint {
  if (!hex || hex === "0x" || hex === "0x0") return 0n;
  return BigInt(hex);
}

/** USDT on BSC has 18 decimals (BSC USDT is not USDT-TRC20 which has 6) */
const USDT_DECIMALS = 18;
/** BNB has 18 decimals */
const BNB_DECIMALS  = 18;
/** Gwei = 1e9 wei */
const GWEI          = 1_000_000_000n;

// ── Address validation ────────────────────────────────────────────────────────

const HEX_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function isValidEthAddress(address: string): boolean {
  return HEX_RE.test(address) && address.toLowerCase() !== ZERO_ADDR;
}

// ── BscWithdrawalGateway ──────────────────────────────────────────────────────

export class BscWithdrawalGateway implements IWithdrawalGateway {
  readonly network = "BEP20" as const;
  readonly isDryRun: boolean;

  private readonly rpc:          BscRpcClient;
  private readonly usdtContract: string;
  private readonly chainId:      number;
  private readonly hotWallet:    string | null;

  constructor(config: BscConfig, hotWalletAddress: string | null, dryRun: boolean) {
    this.rpc          = new BscRpcClient(config);
    this.usdtContract = config.usdtContractAddress;
    this.chainId      = config.chainId;
    this.hotWallet    = hotWalletAddress?.trim() || null;
    this.isDryRun     = dryRun;
  }

  // ── validateAddress ─────────────────────────────────────────────────────────

  validateAddress(address: string): AddressValidation {
    const valid = isValidEthAddress(address);
    return {
      address,
      valid,
      checksumOk: valid,
      reason: valid ? undefined : "Not a valid BEP20 (0x-prefixed 20-byte) address",
    };
  }

  // ── getNativeBalance ────────────────────────────────────────────────────────

  async getNativeBalance(address: string): Promise<BalanceResult> {
    const start  = Date.now();
    const hex    = await this.rpc.call<string>("eth_getBalance", [address, "latest"]);
    const wei    = hexToBigInt(hex);
    const ms     = Date.now() - start;
    const formatted = weiToDecimal(wei, BNB_DECIMALS);
    logger.debug({ address, formatted, ms }, "blockchain.bsc: getNativeBalance");
    return { raw: hex ?? "0x0", formatted, symbol: "BNB" };
  }

  // ── getTokenBalance ─────────────────────────────────────────────────────────

  async getTokenBalance(address: string): Promise<BalanceResult> {
    const start    = Date.now();
    const calldata = encodeBalanceOf(address);
    const hex      = await this.rpc.call<string>("eth_call", [
      { to: this.usdtContract, data: calldata },
      "latest",
    ]);
    const wei       = hexToBigInt(hex);
    const ms        = Date.now() - start;
    const formatted = weiToDecimal(wei, USDT_DECIMALS);
    logger.debug({ address, formatted, ms }, "blockchain.bsc: getTokenBalance");
    return { raw: hex ?? "0x0", formatted, symbol: "USDT" };
  }

  // ── estimateFee ─────────────────────────────────────────────────────────────

  async estimateFee(to: string, usdtAmount: string): Promise<FeeEstimate> {
    const start = Date.now();

    if (!this.hotWallet) {
      logger.warn("blockchain.bsc: estimateFee called but HOT_WALLET_ADDRESS not set — using fallback");
    }
    const from = this.hotWallet ?? "0x0000000000000000000000000000000000000001";

    // Parse USDT amount to wei (18 decimals)
    const amtDecimal = parseFloat(usdtAmount);
    const amtWei     = BigInt(Math.round(amtDecimal * 1e9)) * 10n ** 9n; // avoid float precision
    const calldata   = encodeTransfer(to, amtWei);

    const [gasHex, gasPriceHex] = await Promise.all([
      this.rpc.call<string>("eth_estimateGas", [{
        from,
        to:   this.usdtContract,
        data: calldata,
      }]).catch(() => "0xea60"), // ~60000 gas fallback
      this.rpc.call<string>("eth_gasPrice", []).catch(() => "0x12a05f200"), // ~5 gwei fallback
    ]);

    const gasLimit      = hexToBigInt(gasHex);
    const gasPriceWei   = hexToBigInt(gasPriceHex);
    const feeTotalWei   = gasLimit * gasPriceWei;
    const feeBnb        = weiToDecimal(feeTotalWei, BNB_DECIMALS);
    const gasPriceGwei  = Number(gasPriceWei / GWEI);
    const ms            = Date.now() - start;

    // BNB to USD is not available on-chain — approximate from system settings or use 0
    const estimatedFeeUsd = "0.00"; // TODO Sprint 31C: use price oracle

    logger.info(
      { to, usdtAmount, gasLimit: gasLimit.toString(), gasPriceGwei, feeBnb, ms },
      "blockchain.bsc: estimateFee",
    );

    return {
      estimatedGas:    gasLimit,
      gasPriceWei,
      estimatedFeeBnb: feeBnb,
      estimatedFeeUsd,
    };
  }

  // ── prepareTransfer ─────────────────────────────────────────────────────────

  async prepareTransfer(
    to:           string,
    usdtAmount:   string,
    withdrawalId: string,
  ): Promise<PreparedTransfer> {
    const start = Date.now();
    if (!this.hotWallet) {
      throw new Error("prepareTransfer requires HOT_WALLET_ADDRESS to be configured");
    }

    const from       = this.hotWallet;
    const amtDecimal = parseFloat(usdtAmount);
    const amtWei     = BigInt(Math.round(amtDecimal * 1e9)) * 10n ** 9n;
    const calldata   = encodeTransfer(to, amtWei);

    const [gasHex, gasPriceHex, nonceHex] = await Promise.all([
      this.rpc.call<string>("eth_estimateGas", [{
        from,
        to:   this.usdtContract,
        data: calldata,
      }]).catch(() => "0xea60"),
      this.rpc.call<string>("eth_gasPrice", []).catch(() => "0x12a05f200"),
      this.rpc.call<string>("eth_getTransactionCount", [from, "pending"]).catch(() => "0x0"),
    ]);

    const gasLimit    = hexToBigInt(gasHex);
    const gasPriceWei = hexToBigInt(gasPriceHex);
    const nonce       = Number(hexToBigInt(nonceHex));
    const feeTotalWei = gasLimit * gasPriceWei;
    const feeBnb      = weiToDecimal(feeTotalWei, BNB_DECIMALS);
    const gasPriceGwei = (Number(gasPriceWei) / 1e9).toFixed(2);
    const ms           = Date.now() - start;

    logger.info(
      { withdrawalId, from, to, usdtAmount, gasLimit: gasLimit.toString(), gasPriceGwei, nonce, ms },
      "blockchain.bsc: prepareTransfer (DRY RUN)",
    );

    return {
      network:         "BEP20",
      from,
      to,
      tokenContract:   this.usdtContract,
      amount:          usdtAmount,
      calldata,
      estimatedGas:    gasLimit.toString(),
      gasPriceGwei,
      estimatedFeeBnb: feeBnb,
      chainId:         this.chainId,
      nonce,
      dryRun:          true,
    };
  }

  // ── broadcastTransfer (STUB — throws in dry run) ────────────────────────────

  async broadcastTransfer(_signedRawTx: string): Promise<{ txHash: string }> {
    if (this.isDryRun) {
      throw new GatewayDryRunError();
    }
    // Sprint 31C: implement signing + broadcast
    throw new Error("broadcastTransfer not yet implemented (Sprint 31C)");
  }

  // ── getTransaction ──────────────────────────────────────────────────────────

  async getTransaction(txHash: string): Promise<ChainTransaction | null> {
    const [tx, receipt, blockHex] = await Promise.all([
      this.rpc.call<{
        blockNumber: string | null;
        from: string;
        to: string | null;
      } | null>("eth_getTransactionByHash", [txHash]),
      this.rpc.call<{ status: string } | null>("eth_getTransactionReceipt", [txHash]),
      this.rpc.call<string>("eth_blockNumber", []),
    ]);

    if (!tx) return null;

    const currentBlock = Number(hexToBigInt(blockHex));
    const txBlock      = tx.blockNumber ? Number(hexToBigInt(tx.blockNumber)) : null;
    const confirmations = txBlock ? Math.max(0, currentBlock - txBlock) : 0;

    let status: "success" | "failed" | "pending" = "pending";
    if (receipt) {
      status = receipt.status === "0x1" ? "success" : "failed";
    }

    return {
      txHash,
      blockNumber:   txBlock,
      from:          tx.from,
      to:            tx.to ?? "",
      status,
      confirmations,
    };
  }

  // ── waitForConfirmations ────────────────────────────────────────────────────

  async waitForConfirmations(
    txHash:               string,
    requiredConfirmations: number,
    timeoutMs:             number,
  ): Promise<ChainTransaction> {
    const deadline = Date.now() + timeoutMs;
    const pollMs   = 6_000; // ~BSC block time

    while (Date.now() < deadline) {
      const tx = await this.getTransaction(txHash);
      if (tx && tx.confirmations >= requiredConfirmations) return tx;
      await new Promise((r) => setTimeout(r, pollMs));
    }

    throw new Error(`waitForConfirmations: timed out after ${timeoutMs}ms for ${txHash}`);
  }

  // ── getHealth ───────────────────────────────────────────────────────────────

  async getHealth(): Promise<BlockchainHealthSnapshot> {
    const start    = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      const blockHex = await this.rpc.call<string>("eth_blockNumber", []);
      const latestBlock = Number(hexToBigInt(blockHex));
      const rpcLatencyMs = Date.now() - start;

      const [gasPriceHex, bnbBalance, usdtBalance] = await Promise.all([
        this.rpc.call<string>("eth_gasPrice", []).catch(() => null as string | null),
        this.hotWallet
          ? this.getNativeBalance(this.hotWallet).then((b) => b.formatted).catch(() => null as string | null)
          : Promise.resolve(null as string | null),
        this.hotWallet
          ? this.getTokenBalance(this.hotWallet).then((b) => b.formatted).catch(() => null as string | null)
          : Promise.resolve(null as string | null),
      ]);

      const gasPriceGwei = gasPriceHex
        ? (Number(hexToBigInt(gasPriceHex)) / 1e9).toFixed(2)
        : null;

      return {
        connected:        true,
        network:          "BEP20 (BSC)",
        chainId:          this.chainId,
        latestBlock,
        hotWalletAddress: this.hotWallet,
        bnbBalance,
        usdtBalance,
        gasPriceGwei,
        rpcLatencyMs,
        dryRunMode:       this.isDryRun,
        checkedAt,
      };
    } catch (err) {
      const ms = Date.now() - start;
      logger.error({ err, ms }, "blockchain.bsc: getHealth failed");
      return {
        connected:        false,
        network:          "BEP20 (BSC)",
        chainId:          this.chainId,
        latestBlock:      null,
        hotWalletAddress: this.hotWallet,
        bnbBalance:       null,
        usdtBalance:      null,
        gasPriceGwei:     null,
        rpcLatencyMs:     ms,
        dryRunMode:       this.isDryRun,
        checkedAt,
        error:            err instanceof Error ? err.message : String(err),
      };
    }
  }
}
