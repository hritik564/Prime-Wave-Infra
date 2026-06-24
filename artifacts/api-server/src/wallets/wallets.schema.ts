import { z } from "zod";

const TRANSACTION_TYPES = [
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

const TRANSACTION_STATUSES = ["PENDING", "SUCCESS", "FAILED"] as const;

export const transferSchema = z.object({
  amount: z
    .number({
      required_error: "Amount is required",
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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(TRANSACTION_TYPES).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
});

export type TransferInput = z.infer<typeof transferSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
