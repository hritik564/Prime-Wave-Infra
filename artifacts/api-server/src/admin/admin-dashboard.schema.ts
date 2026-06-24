import { z } from "zod";

// ── User search ───────────────────────────────────────────────────────────────

export const userSearchQuerySchema = z.object({
  username:     z.string().trim().optional(),
  email:        z.string().trim().optional(),
  phone:        z.string().trim().optional(),
  referralCode: z.string().trim().optional(),
  status:       z.enum(["ACTIVE", "INACTIVE", "BLOCKED", "SUSPENDED"]).optional(),
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
});

// ── Wallet adjustment ─────────────────────────────────────────────────────────

export const walletAdjustmentSchema = z.object({
  userId:     z.string().trim().min(1, "userId is required"),
  walletType: z.enum(["DEPOSIT", "INCOME", "WITHDRAWAL"]),
  amount:     z.coerce.number().refine((v) => v !== 0, "Amount must not be zero"),
  reason:     z.string().trim().min(1, "Reason is required").max(500),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserSearchQuery       = z.infer<typeof userSearchQuerySchema>;
export type WalletAdjustmentInput = z.infer<typeof walletAdjustmentSchema>;
