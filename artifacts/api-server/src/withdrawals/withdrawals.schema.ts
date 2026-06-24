import { z } from "zod";

export const WITHDRAWAL_NETWORKS = ["BEP20"] as const;
export const WITHDRAWAL_STATUSES = ["PENDING", "APPROVED", "COMPLETED", "REJECTED", "CANCELLED"] as const;

// ── User schemas ──────────────────────────────────────────────────────────────

export const createWithdrawalSchema = z.object({
  amount:        z.coerce.number().positive("Amount must be positive"),
  walletAddress: z.string().trim().min(1, "Wallet address is required"),
  network:       z.enum(WITHDRAWAL_NETWORKS),
});

export const withdrawalHistoryQuerySchema = z.object({
  status:  z.enum(WITHDRAWAL_STATUSES).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

// ── Admin schemas ─────────────────────────────────────────────────────────────

export const adminWithdrawalListQuerySchema = z.object({
  status:  z.enum(WITHDRAWAL_STATUSES).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

export const completeWithdrawalSchema = z.object({
  txHash: z.string().trim().min(1, "Transaction hash is required"),
});

export const rejectWithdrawalSchema = z.object({
  rejectedReason: z.string().trim().min(1, "Rejection reason is required").max(500),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateWithdrawalInput       = z.infer<typeof createWithdrawalSchema>;
export type WithdrawalHistoryQuery      = z.infer<typeof withdrawalHistoryQuerySchema>;
export type AdminWithdrawalListQuery    = z.infer<typeof adminWithdrawalListQuerySchema>;
export type CompleteWithdrawalInput     = z.infer<typeof completeWithdrawalSchema>;
export type RejectWithdrawalInput       = z.infer<typeof rejectWithdrawalSchema>;
