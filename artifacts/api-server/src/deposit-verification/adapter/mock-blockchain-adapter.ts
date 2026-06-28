import { Prisma } from "@prisma/client";
import type { IBlockchainAdapter, TxVerificationResult, TxDetails } from "./blockchain-adapter.interface";

// ── Mock company wallet & token contract ─────────────────────────────────────

const MOCK_COMPANY_WALLET  = "0xPRIMEWAVE_COMPANY_BEP20_WALLET";
const MOCK_USDT_CONTRACT   = "0x55d398326f99059fF775485246999027B3197955"; // real BSC USDT
const REQUIRED_CONFIRMATIONS = 12;

// ── Hash prefix → scenario mapping ──────────────────────────────────────────
//
// Scenario        Prefix               Behaviour
// ──────────────  ───────────────────  ────────────────────────────────────────
// Valid           0xvalid_             Confirmed (12/12), correct everything
// Pending         0xpending_           Found, 3/12 confirmations (stays waiting)
// Invalid hash    0xinvalid_           Not found (bad format / no TX)
// Wrong network   0xwrongnet_          Wrong network returned
// Wrong recipient 0xwrongrec_          Wrong recipient address
// Wrong token     0xwrongtoken_        Wrong token contract
// TX failed       0xfailed_            TX found but reverted on-chain
// Anything else   (no match)           Not found
//
// Amount encoding (valid/pending):
//   0xvalid_100_<rest>  → amount = 100
//   0xvalid_<rest>      → amount = 100 (default)

function extractAmount(txHash: string, defaultAmount = 100): Prisma.Decimal {
  const parts = txHash.split("_");
  if (parts.length >= 2) {
    const candidate = Number(parts[1]);
    if (!isNaN(candidate) && candidate > 0) {
      return new Prisma.Decimal(candidate);
    }
  }
  return new Prisma.Decimal(defaultAmount);
}

function buildValidDetails(txHash: string, overrides: Partial<TxDetails> = {}): TxDetails {
  return {
    txHash,
    success:          true,
    network:          "BEP20",
    senderAddress:    "0xSENDER_MOCK_ADDRESS",
    recipientAddress: MOCK_COMPANY_WALLET,
    tokenContract:    MOCK_USDT_CONTRACT,
    amount:           extractAmount(txHash),
    confirmations:    REQUIRED_CONFIRMATIONS,
    blockNumber:      1_000_000,
    blockTimestamp:   new Date(),
    ...overrides,
  };
}

// ── MockBlockchainAdapter ─────────────────────────────────────────────────────

export class MockBlockchainAdapter implements IBlockchainAdapter {
  readonly network = "BEP20" as const;

  async verifyTransaction(txHash: string, expectedRecipient?: string): Promise<TxVerificationResult> {
    const h = txHash.toLowerCase();
    // Use the provided expected recipient so the service's recipient check always
    // passes for correctly-prefixed mock hashes. Sprint 25B real adapter ignores this.
    const recipientAddress = expectedRecipient ?? MockBlockchainAdapter.COMPANY_WALLET;

    if (h.startsWith("0xinvalid_") || h === "0xinvalid") {
      return { found: false, error: "Transaction hash not found on-chain" };
    }

    if (h.startsWith("0xfailed_")) {
      return {
        found: true,
        details: buildValidDetails(txHash, { success: false }),
      };
    }

    if (h.startsWith("0xwrongnet_")) {
      return {
        found: true,
        details: buildValidDetails(txHash, { network: "ERC20" }),
      };
    }

    if (h.startsWith("0xwrongrec_")) {
      return {
        found: true,
        details: buildValidDetails(txHash, { recipientAddress: "0xWRONG_RECIPIENT" }),
      };
    }

    if (h.startsWith("0xwrongtoken_")) {
      return {
        found: true,
        details: buildValidDetails(txHash, { tokenContract: "0xWRONG_TOKEN_CONTRACT" }),
      };
    }

    if (h.startsWith("0xpending_")) {
      return {
        found: true,
        details: buildValidDetails(txHash, { confirmations: 3, recipientAddress }),
      };
    }

    if (h.startsWith("0xvalid_")) {
      return {
        found: true,
        details: buildValidDetails(txHash, { confirmations: REQUIRED_CONFIRMATIONS, recipientAddress }),
      };
    }

    return { found: false, error: "Transaction not found" };
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

  /** Expose the mock company wallet so the service can write it to the record. */
  static readonly COMPANY_WALLET = MOCK_COMPANY_WALLET;

  /** Expose required confirmations so the engine can store it on the record. */
  static readonly REQUIRED_CONFIRMATIONS = REQUIRED_CONFIRMATIONS;
}
