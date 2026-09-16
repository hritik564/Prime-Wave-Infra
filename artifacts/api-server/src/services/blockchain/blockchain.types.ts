// ── Blockchain Gateway Types (Withdrawal) ─────────────────────────────────────
//
// All types shared across the withdrawal blockchain gateway layer.
// No blockchain SDK imports — pure TypeScript.

/** Supported networks for withdrawals. Extend as new chains are added. */
export type WithdrawalGatewayNetwork = "BEP20";

/** Result of a balance query. */
export interface BalanceResult {
  /** Raw balance as a hex string (wei / token-unit). */
  raw:       string;
  /** Human-readable decimal string (e.g. "1.234500"). */
  formatted: string;
  /** Symbol for display (e.g. "BNB" or "USDT"). */
  symbol:    string;
}

/** Result of a gas estimation. */
export interface FeeEstimate {
  /** Estimated gas units for the transfer. */
  estimatedGas:     bigint;
  /** Gas price in wei as a BigInt. */
  gasPriceWei:      bigint;
  /** Estimated fee in BNB (string, 8 d.p.). */
  estimatedFeeBnb:  string;
  /** Estimated fee in USD (string, 2 d.p.) — approximated at calltime. */
  estimatedFeeUsd:  string;
}

/** Unsigned transaction data produced by prepareTransfer. Never signed here. */
export interface PreparedTransfer {
  network:             string;
  from:                string;
  to:                  string;
  tokenContract:       string;
  /** Human-readable USDT amount. */
  amount:              string;
  /** ABI-encoded calldata for ERC-20 transfer(address,uint256). */
  calldata:            string;
  /** Estimated gas limit. */
  estimatedGas:        string;
  /** Gas price in gwei. */
  gasPriceGwei:        string;
  /** Estimated gas fee in BNB. */
  estimatedFeeBnb:     string;
  /** Chain ID. */
  chainId:             number;
  /** Nonce for the hot wallet at preparation time (advisory — live nonce fetched at sign time). */
  nonce:               number;
  /** Whether this was a dry run (unsigned only). */
  dryRun:              boolean;
}

/** Result of a successful sign + broadcast operation. */
export interface BroadcastResult {
  /** On-chain transaction hash. */
  txHash:      string;
  /** Timestamp when signing completed. */
  signedAt:    Date;
  /** Timestamp when broadcast completed. */
  broadcastAt: Date;
  /** Nonce used for the transaction. */
  nonce:       number;
  /** Gas price used in gwei. */
  gasPriceGwei: string;
  /** Estimated gas limit. */
  estimatedGas: string;
}

/** On-chain transaction receipt data. */
export interface ChainTransaction {
  txHash:       string;
  blockNumber:  number | null;
  from:         string;
  to:           string;
  chainId:      number;
  status:       "success" | "failed" | "pending";
  confirmations: number;
  tokenTransfers: TokenTransfer[];
  gasUsed?:     string;
}

export interface TokenTransfer {
  tokenContract: string;
  from:          string;
  to:            string;
  amountRaw:     string;
}

export interface TransferExpectation {
  tokenContract: string;
  sender:        string;
  recipient:     string;
  amount:        string;
}

export interface TransferVerification {
  valid:   boolean;
  reason?: string;
  transfer?: TokenTransfer;
}

/** Gateway health snapshot. */
export interface BlockchainHealthSnapshot {
  connected:       boolean;
  network:         string;
  chainId:         number;
  latestBlock:     number | null;
  hotWalletAddress: string | null;
  bnbBalance:      string | null;
  usdtBalance:     string | null;
  gasPriceGwei:    string | null;
  rpcLatencyMs:    number | null;
  dryRunMode:      boolean;
  checkedAt:       string;
  error?:          string;
}

/** Read-only readiness evidence required before live automatic withdrawals. */
export interface BlockchainActivationReadiness {
  ready:                boolean;
  network:              string;
  configuredChainId:    number;
  actualChainId:        number | null;
  latestBlock:          number | null;
  gasEstimationWorks:   boolean;
  usdtContractAddress:  string;
  usdtBytecodePresent:  boolean;
  usdtSymbol:           string | null;
  usdtName:             string | null;
  usdtDecimals:         number | null;
  hotWalletConfigured:  boolean;
  privateKeyConfigured: boolean;
  keyAddressMatch:      boolean;
  rpcProviderCount:     number;
  rpcTimeoutMs:         number;
  rpcMaxRetries:        number;
  errors:               string[];
}

/** Address validation result. */
export interface AddressValidation {
  address:   string;
  valid:     boolean;
  checksumOk: boolean;
  reason?:   string;
}
