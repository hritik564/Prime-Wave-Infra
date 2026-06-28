// ── BSC Blockchain Adapter ────────────────────────────────────────────────────
//
// Production implementation of IBlockchainAdapter for BEP20 (Binance Smart Chain).
// Communicates exclusively through BscRpcClient — no raw HTTP in this file.
//
// Verification flow:
//   eth_getTransactionByHash  → confirm tx exists and is mined
//   eth_getTransactionReceipt → get on-chain status + Transfer event logs
//   eth_blockNumber           → compute confirmation depth
//
// Validation rules (all from on-chain data, never from user input):
//   ✓ Transaction exists and is mined (not pending)
//   ✓ Transaction succeeded on-chain (receipt.status === 0x1)
//   ✓ Correct chain ID (validated once at startup, cached)
//   ✓ USDT BEP20 Transfer event present (contract address matches config)
//   ✓ Recipient matches company wallet
//   ✓ Amount > 0
//   ✓ Confirmation count (service compares against v.requiredConfirmations from DB)

import { Prisma } from "@prisma/client";
import { logger } from "../../../lib/logger";
import type { IBlockchainAdapter, TxVerificationResult } from "../blockchain-adapter.interface";
import type { BscConfig } from "./bsc-config";
import { BscRpcClient } from "./bsc-rpc-client";

// ── EVM JSON-RPC response shapes ──────────────────────────────────────────────

interface EthTransaction {
  hash:        string;
  blockHash:   string | null;
  blockNumber: string | null;    // hex; null if pending
  from:        string;
  to:          string | null;    // null for contract deployments
  value:       string;           // native BNB value in hex wei
  input:       string;           // calldata
}

interface EthLog {
  address:         string;       // emitting contract address (checksummed)
  topics:          string[];     // [topic0, topic1, ...]
  data:            string;       // ABI-encoded non-indexed params
  transactionHash: string;
  blockNumber:     string;       // hex
  logIndex:        string;       // hex
}

interface EthReceipt {
  transactionHash: string;
  blockNumber:     string;       // hex
  status:          string | null; // "0x1" = success, "0x0" = reverted, null = pending
  from:            string;
  to:              string | null;
  logs:            EthLog[];
}

// ── BEP20 Transfer event ──────────────────────────────────────────────────────

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** BSC-pegged USDT has 18 decimal places (unlike Ethereum USDT which has 6). */
const USDT_DECIMALS = 18;
const USDT_DIVISOR  = new Prisma.Decimal("1" + "0".repeat(USDT_DECIMALS)); // 10^18

interface ParsedTransfer {
  from:   string;
  to:     string;
  amount: Prisma.Decimal;
}

function parseTransferLog(log: EthLog): ParsedTransfer | null {
  if (log.topics.length < 3) return null;
  if (log.topics[0].toLowerCase() !== TRANSFER_TOPIC) return null;

  // Topics 1 and 2 are 32-byte padded addresses — take the last 40 hex chars
  const from = ("0x" + log.topics[1].slice(-40)).toLowerCase();
  const to   = ("0x" + log.topics[2].slice(-40)).toLowerCase();

  // log.data is the ABI-encoded uint256 amount (32 bytes, big-endian hex)
  let rawValue: bigint;
  try {
    rawValue = BigInt(log.data === "0x" ? "0x0" : log.data);
  } catch {
    return null; // malformed data
  }

  const amount = new Prisma.Decimal(rawValue.toString()).div(USDT_DIVISOR);
  return { from, to, amount };
}

// ── BSCBlockchainAdapter ──────────────────────────────────────────────────────

export class BSCBlockchainAdapter implements IBlockchainAdapter {
  readonly network               = "BEP20" as const;
  readonly requiredConfirmations: number;

  private readonly rpc:        BscRpcClient;
  private chainIdPromise:      Promise<void> | null = null;

  constructor(private readonly config: BscConfig) {
    this.requiredConfirmations = config.requiredConfirmations;
    this.rpc                   = new BscRpcClient(config);
  }

  // ── IBlockchainAdapter ─────────────────────────────────────────────────────

  /**
   * Verify a BEP20 USDT transaction by hash.
   *
   * The expectedRecipient parameter is intentionally ignored — the real adapter
   * always reads the recipient from the on-chain Transfer event, never from
   * user-provided input. (The mock adapter used it to satisfy its own checks.)
   */
  async verifyTransaction(
    txHash: string,
    _expectedRecipient?: string,
  ): Promise<TxVerificationResult> {
    const hash    = txHash.toLowerCase();
    const startMs = Date.now();

    try {
      // Validate chain ID once at startup (cached promise — no repeat RPC calls)
      await this.ensureChainId();

      // ── Step 1: Fetch raw transaction ──────────────────────────────────────
      const tx = await this.rpc.call<EthTransaction | null>(
        "eth_getTransactionByHash",
        [hash],
      );

      if (!tx) {
        return { found: false, error: "Transaction not found on BSC" };
      }

      if (!tx.blockNumber) {
        // Still pending in mempool
        logger.debug({ txHash: hash }, "BSCBlockchainAdapter: transaction pending in mempool");
        return { found: false, error: "Transaction is pending (not yet mined)" };
      }

      const txBlock = parseInt(tx.blockNumber, 16);

      // ── Step 2: Fetch receipt + current block number in parallel ───────────
      const [receipt, currentBlockHex] = await Promise.all([
        this.rpc.call<EthReceipt | null>("eth_getTransactionReceipt", [hash]),
        this.rpc.call<string>("eth_blockNumber", []),
      ]);

      if (!receipt) {
        // Tx is mined but receipt unavailable (node sync lag) — treat as not-found
        return { found: false, error: "Transaction receipt temporarily unavailable" };
      }

      const currentBlock  = parseInt(currentBlockHex, 16);
      const confirmations = Math.max(0, currentBlock - txBlock + 1);
      const success       = receipt.status === "0x1";

      // ── Step 3: Find USDT Transfer log ────────────────────────────────────
      const usdtLog = receipt.logs.find(
        (log) =>
          log.address.toLowerCase() === this.config.usdtContractAddress &&
          log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
          log.topics.length >= 3,
      );

      if (!usdtLog) {
        // TX found but no USDT transfer event — wrong token or native BNB send
        logger.warn(
          {
            txHash:      hash,
            success,
            contractTo:  receipt.to?.toLowerCase(),
            usdtContract: this.config.usdtContractAddress,
          },
          "BSCBlockchainAdapter: no USDT Transfer event — wrong token",
        );
        // Return success=false so the service marks this as FAILED.
        // The adapter validates token contract — a non-USDT tx is not a valid deposit.
        return {
          found: true,
          details: {
            txHash:           hash,
            success:          false,
            network:          "BEP20",
            senderAddress:    tx.from.toLowerCase(),
            recipientAddress: (receipt.to ?? "").toLowerCase(),
            tokenContract:    (receipt.to ?? "").toLowerCase(),
            amount:           new Prisma.Decimal(0),
            confirmations,
            blockNumber:      txBlock,
          },
        };
      }

      // ── Step 4: Parse Transfer event ───────────────────────────────────────
      const transfer = parseTransferLog(usdtLog);
      if (!transfer) {
        logger.error(
          { txHash: hash },
          "BSCBlockchainAdapter: could not parse Transfer event data",
        );
        return { found: false, error: "Failed to decode USDT Transfer event" };
      }

      // ── Step 5: Validate amount > 0 ────────────────────────────────────────
      // A zero-value transfer is technically valid on-chain but not a real deposit.
      if (transfer.amount.lte(0)) {
        return {
          found: true,
          details: {
            txHash:           hash,
            success:          false,
            network:          "BEP20",
            senderAddress:    transfer.from,
            recipientAddress: transfer.to,
            tokenContract:    usdtLog.address.toLowerCase(),
            amount:           transfer.amount,
            confirmations,
            blockNumber:      txBlock,
          },
        };
      }

      logger.info(
        {
          txHash:                hash,
          confirmations,
          requiredConfirmations: this.config.requiredConfirmations,
          amount:                transfer.amount.toFixed(2),
          success,
          durationMs:            Date.now() - startMs,
        },
        "BSCBlockchainAdapter: verification complete",
      );

      return {
        found: true,
        details: {
          txHash:           hash,
          success,
          network:          "BEP20",
          senderAddress:    transfer.from,
          recipientAddress: transfer.to,
          tokenContract:    usdtLog.address.toLowerCase(),
          amount:           transfer.amount,
          confirmations,
          blockNumber:      txBlock,
        },
      };

    } catch (err) {
      // Surface to the service — it treats adapter errors as transient (retries on next tick)
      logger.error(
        { err, txHash: hash, durationMs: Date.now() - startMs },
        "BSCBlockchainAdapter: verifyTransaction threw — service will retry next tick",
      );
      throw err;
    }
  }

  async getConfirmations(txHash: string): Promise<number | null> {
    const result = await this.verifyTransaction(txHash);
    if (!result.found) return null;
    return result.details.confirmations;
  }

  async validateRecipient(txHash: string, expectedAddress: string): Promise<boolean> {
    const result = await this.verifyTransaction(txHash);
    if (!result.found) return false;
    return result.details.recipientAddress.toLowerCase() === expectedAddress.toLowerCase();
  }

  async validateToken(txHash: string, expectedContract: string): Promise<boolean> {
    const result = await this.verifyTransaction(txHash);
    if (!result.found) return false;
    return result.details.tokenContract.toLowerCase() === expectedContract.toLowerCase();
  }

  async validateAmount(txHash: string, expectedAmount: Prisma.Decimal): Promise<boolean> {
    const result = await this.verifyTransaction(txHash);
    if (!result.found) return false;
    const diff = result.details.amount.minus(expectedAmount).abs();
    return diff.lte(new Prisma.Decimal("0.01"));
  }

  // ── Chain ID validation ───────────────────────────────────────────────────

  /**
   * Validates the RPC endpoint's chain ID against config.chainId.
   * Runs once on the first verifyTransaction call; result is cached via promise.
   * Concurrent callers await the same promise — only one RPC call is made.
   * Resets on failure so the next call retries.
   */
  private ensureChainId(): Promise<void> {
    if (!this.chainIdPromise) {
      this.chainIdPromise = this.validateChainId().catch((err: unknown) => {
        this.chainIdPromise = null; // reset so the next call retries
        throw err;
      });
    }
    return this.chainIdPromise;
  }

  private async validateChainId(): Promise<void> {
    const hex     = await this.rpc.call<string>("eth_chainId", []);
    const chainId = parseInt(hex, 16);

    if (chainId !== this.config.chainId) {
      throw new Error(
        `BSC RPC chain ID mismatch: expected ${this.config.chainId}, got ${chainId}. ` +
        `Check BSC_CHAIN_ID and your RPC endpoint URLs.`,
      );
    }

    logger.info(
      { chainId, rpcProviders: this.config.rpcProviders.length },
      "BSCBlockchainAdapter: chain ID validated",
    );
  }
}
