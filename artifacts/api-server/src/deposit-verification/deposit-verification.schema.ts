import { z } from "zod";

// ── BSC transaction hash validation ──────────────────────────────────────────

const txHashSchema = z
  .string()
  .min(10, "txHash must be at least 10 characters")
  .max(128, "txHash must be at most 128 characters")
  .transform((s) => s.trim().toLowerCase())
  .refine(
    (s) =>
      /^0x[0-9a-f]{64}$/.test(s) ||
      /^0x[0-9a-z_]{6,126}$/.test(s),
    { message: "txHash must start with 0x and contain only valid characters (hex or alphanumeric)" },
  );

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
