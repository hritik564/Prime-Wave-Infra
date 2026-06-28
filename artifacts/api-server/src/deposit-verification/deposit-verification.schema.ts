import { z } from "zod";

// ── BSC transaction hash validation ──────────────────────────────────────────
//
// Production (Sprint 25B): must match strict BSC format: 0x + 64 hex chars.
// Development (Sprint 25A): also allows mock-adapter patterns (0x + hex + underscores).
// Normalization: trimmed and lowercased before the regex check.

const txHashSchema = z
  .string()
  .min(10, "txHash must be at least 10 characters")
  .max(128, "txHash must be at most 128 characters")
  .transform((s) => s.trim().toLowerCase())
  .refine(
    (s) =>
      /^0x[0-9a-f]{64}$/.test(s) ||          // strict BSC format (Sprint 25B+)
      /^0x[0-9a-z_]{6,126}$/.test(s),        // Sprint 25A: mock hashes (lowercase alphanumeric + _)
    { message: "txHash must start with 0x and contain only valid characters (hex or alphanumeric)" },
  );

// ── User endpoints ────────────────────────────────────────────────────────────

export const submitVerificationSchema = z.object({
  txHash: txHashSchema,
  // L2: BEP20 only. Extend to ["BEP20", "TRC20", "ERC20", "SOL"] when
  // additional real blockchain adapters are registered in Sprint 25C+.
  network: z.literal("BEP20", {
    errorMap: () => ({ message: "Only BEP20 (BSC) deposits are accepted at this time" }),
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
