// ── BSC Withdrawal Gateway ─────────────────────────────────────────────────────
//
// Implements IWithdrawalGateway for Binance Smart Chain (BEP20 / USDT).
//
// Uses the shared BscRpcClient (pure fetch, no ethers.js) and BscConfig
// already proven in the deposit verification layer.
//
// Signing uses viem (pure JS, no native bindings) — the private key is loaded
// once in the constructor, never logged, never exposed to callers.
//
// NonceLock serializes sign+broadcast operations per hot wallet to prevent
// concurrent calls from ever reusing the same nonce.

import { privateKeyToAccount } from "viem/accounts";
import { BscRpcClient } from "../../deposit-verification/adapter/bsc/bsc-rpc-client";
import type { BscConfig } from "../../deposit-verification/adapter/bsc/bsc-config";
import { logger } from "../../lib/logger";
import {
  GatewayDryRunError,
  GatewaySigningError,
  GatewayBroadcastError,
} from "./blockchain.interface";
import type { IWithdrawalGateway } from "./blockchain.interface";
import type {
  AddressValidation,
  BalanceResult,
  BlockchainHealthSnapshot,
  BroadcastResult,
  ChainTransaction,
  FeeEstimate,
  PreparedTransfer,
  TokenTransfer,
  TransferExpectation,
  TransferVerification,
} from "./blockchain.types";
import { withDistributedNonceLock } from "./nonce-manager";
import { parseTokenAmount } from "./token-amount";

// ── ABI helpers ───────────────────────────────────────────────────────────────

/** ERC-20 transfer(address,uint256) selector */
const TRANSFER_SELECTOR = "0xa9059cbb";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** ERC-20 balanceOf(address) selector */
const BALANCE_OF_SELECTOR = "0x70a08231";

/** Pad a hex string (without 0x) to 32 bytes */
function pad32(hex: string): string {
  return hex.replace(/^0x/, "").padStart(64, "0");
}

/** Encode ERC-20 transfer calldata */
function encodeTransfer(to: string, amountWei: bigint): string {
  const toHex  = pad32(to.toLowerCase().replace("0x", ""));
  const amtHex = pad32(amountWei.toString(16));
  return `${TRANSFER_SELECTOR}${toHex}${amtHex}`;
}

/** Encode ERC-20 balanceOf calldata */
function encodeBalanceOf(address: string): string {
  const addrHex = pad32(address.toLowerCase().replace("0x", ""));
  return `${BALANCE_OF_SELECTOR}${addrHex}`;
}

/** Convert wei (bigint) to a formatted decimal string with `decimals` places */
function weiToDecimal(wei: bigint, decimals: number): string {
  const factor  = 10n ** BigInt(decimals);
  const whole   = wei / factor;
  const frac    = wei % factor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0";
  return `${whole}.${fracStr}`;
}

/** Parse a hex string result from eth_call or eth_getBalance to bigint */
function hexToBigInt(hex: string | null | undefined): bigint {
  if (!hex || hex === "0x" || hex === "0x0") return 0n;
  return BigInt(hex);
}

/** BNB has 18 decimals */
const BNB_DECIMALS  = 18;
/** Gwei = 1e9 wei */
const GWEI          = 1_000_000_000n;

// ── Address validation ────────────────────────────────────────────────────────

const HEX_RE    = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function isValidEthAddress(address: string): boolean {
  return HEX_RE.test(address) && address.toLowerCase() !== ZERO_ADDR;
}

// ── BscWithdrawalGateway ──────────────────────────────────────────────────────

export class BscWithdrawalGateway implements IWithdrawalGateway {
  readonly network  = "BEP20" as const;
  readonly isDryRun: boolean;

  private readonly rpc:          BscRpcClient;
  private readonly usdtContract: string;
  private readonly usdtDecimals: number;
  private readonly chainId:      number;
  private readonly hotWallet:    string | null;
  private readonly privateKey:   `0x${string}` | null;

  constructor(config: BscConfig, hotWalletAddress: string | null, dryRun: boolean, privateKey: string | null) {
    this.rpc          = new BscRpcClient(config);
    this.usdtContract = config.usdtContractAddress;
    this.usdtDecimals = config.usdtDecimals;
    this.chainId      = config.chainId;
    this.hotWallet    = hotWalletAddress?.trim() || null;
    this.isDryRun     = dryRun;

    if (this.hotWallet && !isValidEthAddress(this.hotWallet)) {
      throw new Error("HOT_WALLET_ADDRESS must be a valid non-zero 20-byte address");
    }

    // Validate private key format if provided
    if (privateKey) {
      const pk = privateKey.trim().startsWith("0x") ? privateKey.trim() : `0x${privateKey.trim()}`;
      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
        throw new Error("HOT_WALLET_PRIVATE_KEY must be a 32-byte hex string (64 hex chars)");
      }
      this.privateKey = pk as `0x${string}`;
      if (this.hotWallet) {
        const account = privateKeyToAccount(this.privateKey);
        if (account.address.toLowerCase() !== this.hotWallet.toLowerCase()) {
          throw new Error("HOT_WALLET_PRIVATE_KEY does not correspond to HOT_WALLET_ADDRESS");
        }
      }
    } else {
      this.privateKey = null;
    }
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
    const start     = Date.now();
    const hex       = await this.rpc.call<string>("eth_getBalance", [address, "latest"]);
    const wei       = hexToBigInt(hex);
    const ms        = Date.now() - start;
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
    const formatted = weiToDecimal(wei, this.usdtDecimals);
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

    const amtWei     = parseTokenAmount(usdtAmount, this.usdtDecimals);
    const calldata   = encodeTransfer(to, amtWei);

    const [gasHex, gasPriceHex] = await Promise.all([
      this.rpc.call<string>("eth_estimateGas", [{
        from,
        to:   this.usdtContract,
        data: calldata,
      }]).catch(() => "0xea60"), // ~60000 gas fallback
      this.rpc.call<string>("eth_gasPrice", []).catch(() => "0x12a05f200"), // ~5 gwei fallback
    ]);

    const gasLimit     = hexToBigInt(gasHex);
    const gasPriceWei  = hexToBigInt(gasPriceHex);
    const feeTotalWei  = gasLimit * gasPriceWei;
    const feeBnb       = weiToDecimal(feeTotalWei, BNB_DECIMALS);
    const gasPriceGwei = Number(gasPriceWei / GWEI);
    const ms           = Date.now() - start;

    logger.info(
      { to, usdtAmount, gasLimit: gasLimit.toString(), gasPriceGwei, feeBnb, ms },
      "blockchain.bsc: estimateFee",
    );

    return {
      estimatedGas:    gasLimit,
      gasPriceWei,
      estimatedFeeBnb: feeBnb,
      estimatedFeeUsd: "0.00",
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
    const amtWei     = parseTokenAmount(usdtAmount, this.usdtDecimals);
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

    const gasLimit     = hexToBigInt(gasHex);
    const gasPriceWei  = hexToBigInt(gasPriceHex);
    const nonce        = Number(hexToBigInt(nonceHex));
    const feeTotalWei  = gasLimit * gasPriceWei;
    const feeBnb       = weiToDecimal(feeTotalWei, BNB_DECIMALS);
    const gasPriceGwei = (Number(gasPriceWei) / 1e9).toFixed(2);
    const ms           = Date.now() - start;

    logger.info(
      { withdrawalId, from, to, usdtAmount, gasLimit: gasLimit.toString(), gasPriceGwei, nonce, ms },
      "blockchain.bsc: prepareTransfer",
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
      dryRun:          this.isDryRun,
    };
  }

  // ── signAndBroadcast ─────────────────────────────────────────────────────────
  //
  // Serialized via NonceLock — only one signAndBroadcast runs at a time per
  // hot wallet, preventing concurrent operations from reusing the same nonce.
  //
  // Never logs the private key or raw signed transaction.

  async signAndBroadcast(prepared: PreparedTransfer): Promise<BroadcastResult> {
    if (this.isDryRun) {
      throw new GatewayDryRunError();
    }
    if (!this.hotWallet) {
      throw new GatewaySigningError("HOT_WALLET_ADDRESS is not configured");
    }
    if (!this.privateKey) {
      throw new GatewaySigningError(
        "HOT_WALLET_PRIVATE_KEY is not configured — cannot sign transactions",
      );
    }

    return withDistributedNonceLock(this.hotWallet, async () => {
      // ── 1. Fetch live gas price and nonce (inside the lock) ──────────────────
      const [gasPriceHex, nonceHex] = await Promise.all([
        this.rpc.call<string>("eth_gasPrice", []).catch(() => null as string | null),
        this.rpc.call<string>("eth_getTransactionCount", [this.hotWallet!, "pending"]),
      ]);

      if (!gasPriceHex) {
        throw new GatewayBroadcastError("Unable to obtain a gas price; broadcast was not attempted");
      }
      const gasPriceWei  = hexToBigInt(gasPriceHex);
      const nonce        = Number(hexToBigInt(nonceHex));
      const gasLimit     = BigInt(prepared.estimatedGas);
       const amtWei       = parseTokenAmount(prepared.amount, this.usdtDecimals);
      const gasPriceGwei = (Number(gasPriceWei) / 1e9).toFixed(4);

      logger.info(
        {
          to:           prepared.to,
          amount:       prepared.amount,
          nonce,
          gasLimit:     gasLimit.toString(),
          gasPriceGwei,
          network:      prepared.network,
        },
        "blockchain.bsc: signing started",
      );

      // ── 2. Sign the transaction ───────────────────────────────────────────────
      let signedTx: `0x${string}`;
      const signedAt = new Date();

      try {
        const account = privateKeyToAccount(this.privateKey!);

        signedTx = await account.signTransaction({
          chainId:  this.chainId,
          to:       this.usdtContract as `0x${string}`,
          value:    0n,
          data:     prepared.calldata as `0x${string}`,
          gas:      gasLimit,
          gasPrice: gasPriceWei,
          nonce,
          type:     "legacy",
        });

        logger.info(
          { nonce, gasLimit: gasLimit.toString(), gasPriceGwei },
          "blockchain.bsc: signing completed",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg, nonce }, "blockchain.bsc: signing failed");
        throw new GatewaySigningError(`Transaction signing failed: ${msg}`);
      }

      // ── 3. Broadcast via eth_sendRawTransaction ───────────────────────────────
      logger.info(
        { to: prepared.to, amount: prepared.amount, nonce },
        "blockchain.bsc: broadcast started",
      );

      let txHash: string;
      const broadcastAt = new Date();

      try {
        const result = await this.rpc.call<string>("eth_sendRawTransaction", [signedTx]);

        if (!result || typeof result !== "string" || !result.startsWith("0x")) {
          throw new Error(`Unexpected response from eth_sendRawTransaction: ${String(result)}`);
        }

        txHash = result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ err: msg, nonce, to: prepared.to, amount: prepared.amount }, "blockchain.bsc: broadcast failed");
        throw new GatewayBroadcastError(`Transaction broadcast failed: ${msg}`);
      }

      logger.info(
        { txHash, nonce, to: prepared.to, amount: prepared.amount, gasPriceGwei },
        "blockchain.bsc: broadcast completed",
      );

      return {
        txHash,
        signedAt,
        broadcastAt,
        nonce,
        gasPriceGwei,
        estimatedGas: prepared.estimatedGas,
      };
    });
  }

  // ── getTransaction ──────────────────────────────────────────────────────────

  async getTransaction(txHash: string): Promise<ChainTransaction | null> {
    const [tx, receipt, blockHex, chainHex] = await Promise.all([
      this.rpc.call<{
        blockNumber: string | null;
        from: string;
        to: string | null;
      } | null>("eth_getTransactionByHash", [txHash]),
      this.rpc.call<{
        status: string;
        logs?: Array<{ address: string; topics: string[]; data: string }>;
      } | null>("eth_getTransactionReceipt", [txHash]),
      this.rpc.call<string>("eth_blockNumber", []),
      this.rpc.call<string>("eth_chainId", []),
    ]);

    if (!tx) return null;

    const currentBlock  = Number(hexToBigInt(blockHex));
    const txBlock       = tx.blockNumber ? Number(hexToBigInt(tx.blockNumber)) : null;
    const confirmations = txBlock ? Math.max(0, currentBlock - txBlock) : 0;

    let status: "success" | "failed" | "pending" = "pending";
    if (receipt) {
      status = receipt.status === "0x1" ? "success" : "failed";
    }

    const tokenTransfers: TokenTransfer[] = [];
    for (const log of receipt?.logs ?? []) {
      if (
        log.address.toLowerCase() !== this.usdtContract.toLowerCase() ||
        log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC ||
        log.topics.length < 3
      ) continue;

      tokenTransfers.push({
        tokenContract: log.address,
        from: `0x${log.topics[1].slice(-40)}`,
        to: `0x${log.topics[2].slice(-40)}`,
        amountRaw: hexToBigInt(log.data).toString(),
      });
    }

    return {
      txHash,
      blockNumber: txBlock,
      from:        tx.from,
      to:          tx.to ?? "",
      chainId:     Number(hexToBigInt(chainHex)),
      status,
      confirmations,
      tokenTransfers,
    };
  }

  verifyTransfer(
    transaction: ChainTransaction,
    expected: TransferExpectation,
  ): TransferVerification {
    if (transaction.chainId !== this.chainId) {
      return { valid: false, reason: `Unexpected chain ID ${transaction.chainId}` };
    }
    if (expected.tokenContract.toLowerCase() !== this.usdtContract.toLowerCase()) {
      return { valid: false, reason: "Unexpected token contract" };
    }
    if (transaction.from.toLowerCase() !== expected.sender.toLowerCase()) {
      return { valid: false, reason: "Transaction sender does not match the hot wallet" };
    }
    if (transaction.to.toLowerCase() !== this.usdtContract.toLowerCase()) {
      return { valid: false, reason: "Transaction target is not the configured token contract" };
    }

    let expectedAmount: bigint;
    try {
      expectedAmount = parseTokenAmount(expected.amount, this.usdtDecimals);
    } catch (err) {
      return { valid: false, reason: err instanceof Error ? err.message : String(err) };
    }

    const transfer = transaction.tokenTransfers.find((candidate) =>
      candidate.tokenContract.toLowerCase() === this.usdtContract.toLowerCase() &&
      candidate.from.toLowerCase() === expected.sender.toLowerCase() &&
      candidate.to.toLowerCase() === expected.recipient.toLowerCase() &&
      candidate.amountRaw === expectedAmount.toString(),
    );

    return transfer
      ? { valid: true, transfer }
      : { valid: false, reason: "No matching USDT Transfer event found" };
  }

  // ── waitForConfirmations ────────────────────────────────────────────────────

  async waitForConfirmations(
    txHash:                string,
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
    const start     = Date.now();
    const checkedAt = new Date().toISOString();

    try {
      const blockHex    = await this.rpc.call<string>("eth_blockNumber", []);
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
