// ── Withdrawal Blockchain Gateway Interface ────────────────────────────────────
//
// All withdrawal blockchain operations pass through this interface.
// Concrete implementations: BscWithdrawalGateway (BSC mainnet/testnet).
// Future: EthWithdrawalGateway, TronWithdrawalGateway, etc.
//
// SAFETY CONTRACT:
//   signAndBroadcast() throws GatewayDryRunError when BLOCKCHAIN_DRY_RUN=true.
//   Callers must check isDryRun before calling signAndBroadcast.

import type {
  BalanceResult,
  BlockchainHealthSnapshot,
  BroadcastResult,
  ChainTransaction,
  AddressValidation,
  FeeEstimate,
  PreparedTransfer,
  WithdrawalGatewayNetwork,
} from "./blockchain.types";

export class GatewayDryRunError extends Error {
  constructor() {
    super("signAndBroadcast is disabled in dry-run mode (BLOCKCHAIN_DRY_RUN=true)");
    this.name = "GatewayDryRunError";
  }
}

export class GatewayNotConfiguredError extends Error {
  constructor(network: string) {
    super(`WithdrawalGateway not configured for network: ${network}`);
    this.name = "GatewayNotConfiguredError";
  }
}

export class GatewaySigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewaySigningError";
  }
}

export class GatewayBroadcastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayBroadcastError";
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
   * Sign and broadcast a USDT transfer, using the hot wallet private key
   * held exclusively inside the gateway. Never exposes the private key.
   *
   * THROWS GatewayDryRunError   when isDryRun === true.
   * THROWS GatewaySigningError  when signing fails.
   * THROWS GatewayBroadcastError when broadcast fails.
   *
   * Nonce is acquired exclusively inside this call (serialized via NonceLock).
   *
   * @param prepared  The PreparedTransfer from a prior prepareTransfer() call.
   */
  signAndBroadcast(prepared: PreparedTransfer): Promise<BroadcastResult>;

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
