import { z } from "zod";

// ── User endpoints ────────────────────────────────────────────────────────────

export const submitVerificationSchema = z.object({
  txHash: z
    .string()
    .min(10, "txHash must be at least 10 characters")
    .max(128, "txHash must be at most 128 characters")
    .regex(/^0x[0-9a-fA-F]{6,}$|^0x[a-zA-Z0-9_]+$/, "Invalid transaction hash format"),
  network: z.enum(["BEP20", "ERC20", "TRC20", "SOL"], {
    errorMap: () => ({ message: "network must be one of: BEP20, ERC20, TRC20, SOL" }),
  }),
});

export const verificationStatusSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});

// ── Admin endpoints ───────────────────────────────────────────────────────────

export const adminListVerificationsSchema = z.object({
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
  status:  z.enum(["CREATED", "TX_SUBMITTED", "VERIFYING", "WAITING_CONFIRMATIONS", "CONFIRMED", "CREDITED", "COMPLETED", "FAILED", "REJECTED", "EXPIRED"]).optional(),
  network: z.enum(["BEP20", "ERC20", "TRC20", "SOL"]).optional(),
  search:  z.string().max(100).optional(),
});

export const adminGetVerificationSchema = z.object({
  id: z.string().min(1, "Verification ID is required"),
});
