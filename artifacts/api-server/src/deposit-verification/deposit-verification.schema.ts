import { z } from "zod";

// ── BSC transaction hash validation ──────────────────────────────────────────

const txHashSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .superRefine((s, ctx) => {
    if (s.length === 42) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "This looks like a wallet address, not a transaction hash. " +
          "A transaction hash is 66 characters long (0x followed by 64 hex digits). " +
          "Find it on BscScan under the transaction details.",
      });
      return z.NEVER;
    }
    if (!/^0x[0-9a-f]{64}$/.test(s)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Transaction hash must be exactly 66 characters: 0x followed by 64 hex digits.",
      });
    }
  });

// ── User endpoints ────────────────────────────────────────────────────────────

export const submitVerificationSchema = z.object({
  txHash: txHashSchema,
  network: z.literal("BEP20", {
    errorMap: () => ({ message: "Only BEP20 (BSC) deposits are accepted at this time" }),
  }),
});

export const verificationStatusSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});

export const userHistorySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ── Admin endpoints ───────────────────────────────────────────────────────────

export const adminListVerificationsSchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  status:  z.enum([
    "CREATED", "TX_SUBMITTED", "VERIFYING", "VERIFICATION_DELAYED",
    "WAITING_CONFIRMATIONS", "CONFIRMED", "CREDITED",
    "COMPLETED", "FAILED", "REJECTED", "EXPIRED",
  ]).optional(),
  network: z.enum(["BEP20", "ERC20", "TRC20", "SOL"]).optional(),
  search:  z.string().max(100).optional(),
});

export const adminGetVerificationSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});

export const adminRetryVerificationSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});

export const adminRevalidateParamsSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});

export const adminManualApproveParamsSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});

export const adminManualApproveBodySchema = z.object({
  creditAmount: z
    .string()
    .regex(
      /^\d+(\.\d{1,8})?$/,
      "Credit amount must be a positive number with up to 8 decimal places",
    )
    .refine((v) => parseFloat(v) > 0, { message: "Credit amount must be greater than zero" }),
  reason: z
    .string()
    .min(15, "Reason must be at least 15 characters")
    .max(500, "Reason must be at most 500 characters"),
});

export const adminRejectParamsSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});

export const adminRejectBodySchema = z.object({
  reason: z
    .string()
    .min(10, "Rejection reason must be at least 10 characters")
    .max(500, "Rejection reason must be at most 500 characters"),
});
