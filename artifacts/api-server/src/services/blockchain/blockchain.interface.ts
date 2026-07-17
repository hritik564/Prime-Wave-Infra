// ── Withdrawal Blockchain Gateway Interface ────────────────────────────────────
//
// All withdrawal blockchain operations pass through this interface.
// Concrete implementations: BscWithdrawalGateway (BSC mainnet/testnet).
// Future: EthWithdrawalGateway, TronWithdrawalGateway, etc.
//
// SAFETY CONTRACT:
//   broadcastTransfer() throws GatewayDryRunError when BLOCKCHAIN_DRY_RUN=true.
//   Callers must check isDryRun before calling broadcastTransfer.

import type {
  BalanceResult,
  BlockchainHealthSnapshot,
  ChainTransaction,
  AddressValidation,
  FeeEstimate,
  PreparedTransfer,
  WithdrawalGatewayNetwork,
} from "./blockchain.types";

export class GatewayDryRunError extends Error {
  constructor() {
    super("broadcastTransfer is disabled in dry-run mode (BLOCKCHAIN_DRY_RUN=true)");
    this.name = "GatewayDryRunError";
  }
}

export class GatewayNotConfiguredError extends Error {
  constructor(network: string) {
    super(`WithdrawalGateway not configured for network: ${network}`);
    this.name = "GatewayNotConfiguredError";
  }
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IWithdrawalGateway {
  /** Which network this gateway handles. */
  readonly network: WithdrawalGatewayNetwork;

  /** Whether the gateway is in dry-run mode (no broadcast). */
  readonly isDryRun: boolean;

  /**
   * Validate a wallet address (format + optional checksum).
   * Does NOT query the blockchain.
   */
  validateAddress(address: string): AddressValidation;

  /**
   * Get the native coin (BNB) balance of an address.
   */
  getNativeBalance(address: string): Promise<BalanceResult>;

  /**
   * Get the USDT token balance of an address.
   */
  getTokenBalance(address: string): Promise<BalanceResult>;

  /**
   * Estimate the gas fee for sending USDT to a recipient.
   * Returns fee denominated in BNB and USD (approx).
   */
  estimateFee(to: string, usdtAmount: string): Promise<FeeEstimate>;

  /**
   * Prepare an unsigned USDT transfer transaction.
   * Returns calldata and metadata. Never signs or broadcasts.
   *
   * @param withdrawalId  Idempotency key — stored in preparedTx metadata.
   */
  prepareTransfer(
    to:           string,
    usdtAmount:   string,
    withdrawalId: string,
  ): Promise<PreparedTransfer>;

  /**
   * Broadcast a signed raw transaction.
   * THROWS GatewayDryRunError when isDryRun === true.
   * Sprint 31C will implement this.
   *
   * @param signedRawTx   Hex-encoded signed raw transaction.
   */
  broadcastTransfer(signedRawTx: string): Promise<{ txHash: string }>;

  /**
   * Fetch on-chain transaction status by hash.
   */
  getTransaction(txHash: string): Promise<ChainTransaction | null>;

  /**
   * Poll until the transaction reaches the required confirmation depth,
   * or throw if it times out.
   */
  waitForConfirmations(
    txHash:               string,
    requiredConfirmations: number,
    timeoutMs:             number,
  ): Promise<ChainTransaction>;

  /**
   * Full health snapshot: RPC connectivity, block number, hot wallet balances.
   */
  getHealth(): Promise<BlockchainHealthSnapshot>;
}
