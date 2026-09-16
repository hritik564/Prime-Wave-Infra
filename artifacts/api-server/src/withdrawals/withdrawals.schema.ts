import { z } from "zod";

export const WITHDRAWAL_NETWORKS = ["BEP20"] as const;
export const WITHDRAWAL_STATUSES = [
  "PENDING", "VALIDATING", "QUEUED", "PROCESSING",
  "SIGNED", "BROADCASTING", "BROADCAST_UNKNOWN", "CONFIRMING", "MANUAL_REVIEW", "UNDER_REVIEW", "APPROVED", "COMPLETED",
  "FAILED", "REJECTED", "CANCELLED",
] as const;

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

export const updateWithdrawalSettingsSchema = z.object({
  minimumAmount: z.coerce.number().positive("Minimum amount must be positive").optional(),
  maximumAmount: z.coerce.number().positive("Maximum amount must be positive").optional(),
  isEnabled:     z.boolean().optional(),
}).refine(
  (v) => v.minimumAmount === undefined || v.maximumAmount === undefined || v.minimumAmount <= v.maximumAmount,
  { message: "Minimum amount must not exceed maximum amount" },
);

// ── Admin schemas ─────────────────────────────────────────────────────────────

export const adminWithdrawalListQuerySchema = z.object({
  status:    z.enum(WITHDRAWAL_STATUSES).optional(),
  search:    z.string().trim().max(100).optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  dateFrom:  z.string().optional(),
  dateTo:    z.string().optional(),
  sortBy:    z.enum(["createdAt", "amount", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(25),
});

export const approveWithdrawalSchema = z.object({
  adminNotes: z.string().trim().max(1000).optional(),
});

export const completeWithdrawalSchema = z.object({
  txHash:     z.string().trim().min(1, "Transaction hash is required"),
  adminNotes: z.string().trim().max(1000).optional(),
});

export const rejectWithdrawalSchema = z.object({
  rejectedReason: z.string().trim().min(1, "Rejection reason is required").max(500),
  adminNotes:     z.string().trim().max(1000).optional(),
});

export const holdWithdrawalSchema = z.object({
  reason:     z.string().trim().min(1, "Hold reason is required").max(500),
  reviewDate: z.string().optional(),
});

export const reconcileWithdrawalSchema = z.object({
  reason: z.string().trim().min(1, "Reconciliation reason is required").max(500),
});

export const updateWithdrawalNotesSchema = z.object({
  adminNotes: z.string().trim().max(2000),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type UpdateWithdrawalSettingsInput = z.infer<typeof updateWithdrawalSettingsSchema>;
export type CreateWithdrawalInput       = z.infer<typeof createWithdrawalSchema>;
export type WithdrawalHistoryQuery      = z.infer<typeof withdrawalHistoryQuerySchema>;
export type AdminWithdrawalListQuery    = z.infer<typeof adminWithdrawalListQuerySchema>;
export type ApproveWithdrawalInput      = z.infer<typeof approveWithdrawalSchema>;
export type CompleteWithdrawalInput     = z.infer<typeof completeWithdrawalSchema>;
export type RejectWithdrawalInput       = z.infer<typeof rejectWithdrawalSchema>;
export type HoldWithdrawalInput         = z.infer<typeof holdWithdrawalSchema>;
export type ReconcileWithdrawalInput    = z.infer<typeof reconcileWithdrawalSchema>;
export type UpdateWithdrawalNotesInput  = z.infer<typeof updateWithdrawalNotesSchema>;
