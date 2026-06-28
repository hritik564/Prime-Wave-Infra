import type { Prisma, DepositNetwork } from "@prisma/client";

// ── Transaction details returned by the adapter ───────────────────────────────

export interface TxDetails {
  txHash:           string;
  success:          boolean;
  network:          DepositNetwork;
  senderAddress:    string;
  recipientAddress: string;
  tokenContract:    string;
  amount:           Prisma.Decimal;
  confirmations:    number;
  blockNumber?:     number;
  blockTimestamp?:  Date;
}

// ── Result wrapper — adapter never throws, always returns a structured result ─

export type TxVerificationResult =
  | { found: false;  error: string }
  | { found: true;   details: TxDetails };

// ── Blockchain Adapter interface ──────────────────────────────────────────────
//
// The Deposit Verification Engine communicates ONLY through this interface.
// No blockchain-specific imports or logic must appear outside adapters.
//
// Adapters are stateless — every method is pure given the txHash.
// All workflow state (attempts, timestamps) lives in DepositVerification rows.
//
// Sprint 25A:  MockBlockchainAdapter  (deterministic, prefix-driven)
// Sprint 25B:  BSCBlockchainAdapter   (real BNB Smart Chain RPC)

export interface IBlockchainAdapter {
  /** Which network this adapter handles. */
  readonly network: DepositNetwork;

  /**
   * How many block confirmations this adapter considers sufficient.
   * The service writes this value to the verification record at submit time,
   * so each adapter owns its own confirmation threshold.
   */
  readonly requiredConfirmations: number;

  /**
   * Fetch transaction details from the blockchain.
   * Returns `{ found: false }` if the hash is unknown / not yet indexed.
   *
   * @param expectedRecipient  The company wallet address the user was shown.
   *   Sprint 25A: passed to the mock so it echoes a realistic recipient.
   *   Sprint 25B: ignored by the real BSC adapter (it reads from chain).
   */
  verifyTransaction(txHash: string, expectedRecipient?: string): Promise<TxVerificationResult>;

  /**
   * Returns the current on-chain confirmation count, or null if not found.
   * Called by the engine to check WAITING_CONFIRMATIONS progress.
   */
  getConfirmations(txHash: string): Promise<number | null>;

  /**
   * Returns true if the on-chain recipient matches the expected company wallet.
   */
  validateRecipient(txHash: string, expectedAddress: string): Promise<boolean>;

  /**
   * Returns true if the token contract matches the expected USDT contract.
   */
  validateToken(txHash: string, expectedContract: string): Promise<boolean>;

  /**
   * Returns true if the on-chain amount matches the expected amount (± 0.01 tolerance).
   */
  validateAmount(txHash: string, expectedAmount: Prisma.Decimal): Promise<boolean>;
}
