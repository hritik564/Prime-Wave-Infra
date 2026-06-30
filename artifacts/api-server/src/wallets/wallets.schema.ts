import { z } from "zod";

export const TRANSACTION_TYPES = [
  "DEPOSIT",
  "INVESTMENT",
  "ROI_CLAIM",
  "PRINCIPAL_RELEASE",
  "INCOME_TRANSFER",
  "BINARY_MATCH",
  "BINARY_ORBIT",
  "LEVEL_INCOME",
  "SALARY",
  "WITHDRAWAL",
] as const;

// ── Per-wallet allowed transaction types ───────────────────────────────────────
// These define the strict affinity between each wallet view and the transaction
// types that appear in it. getWalletHistory enforces these when `wallet` is set.

export const DEPOSIT_WALLET_TYPES = [
  "DEPOSIT",
] as const satisfies readonly (typeof TRANSACTION_TYPES[number])[];

export const INCOME_WALLET_TYPES = [
  "ROI_CLAIM",
  "PRINCIPAL_RELEASE",
] as const satisfies readonly (typeof TRANSACTION_TYPES[number])[];

export const WITHDRAWAL_WALLET_TYPES = [
  "ROI_CLAIM",
  "PRINCIPAL_RELEASE",
  "INCOME_TRANSFER",
  "BINARY_MATCH",
  "BINARY_ORBIT",
  "LEVEL_INCOME",
  "SALARY",
  "WITHDRAWAL",
] as const satisfies readonly (typeof TRANSACTION_TYPES[number])[];

// ── Schemas ────────────────────────────────────────────────────────────────────

const TRANSACTION_STATUSES = ["PENDING", "SUCCESS", "FAILED"] as const;

export const WALLET_VIEWS = [
  "DEPOSIT_WALLET",
  "INCOME_WALLET",
  "WITHDRAWAL_WALLET",
] as const;

export type WalletView = typeof WALLET_VIEWS[number];

export const transferSchema = z.object({
  amount: z
    .number({
      required_error:    "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .positive("Amount must be greater than zero")
    .max(1_000_000, "Amount exceeds maximum allowed per transfer")
    .refine(
      (n) => Number.isFinite(n) && Number(n.toFixed(8)) === n,
      "Amount must have at most 8 decimal places",
    ),
});

export const historyQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  type:   z.enum(TRANSACTION_TYPES).optional(),
  types:  z.string().optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  // When present, overrides type/types and enforces wallet-affinity filtering.
  wallet: z.enum(WALLET_VIEWS).optional(),
});

export type TransferInput     = z.infer<typeof transferSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
