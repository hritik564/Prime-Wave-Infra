import { z } from "zod";

export const DEPOSIT_NETWORKS         = ["BEP20", "ERC20", "TRC20", "SOL"] as const;
export const DEPOSIT_STATUSES         = ["PENDING", "APPROVED", "REJECTED"] as const;
export const DEPOSIT_STATUSES_ADMIN   = ["PENDING", "CONFIRMING", "APPROVED", "REJECTED"] as const;

// ── Manual Admin Deposit ──────────────────────────────────────────────────────
// Used by POST /api/admin/deposits/manual (SUPER_ADMIN + FINANCE_ADMIN only).
// The deposit wallet accepts any positive USDT amount — no amount restrictions.
// All investment business rules remain exclusively inside the Investment Engine.
export const manualAdminDepositSchema = z.object({
  userId:  z.string().min(1, "Target user ID is required"),
  amount:  z.number({
             required_error:    "Amount is required",
             invalid_type_error: "Amount must be a number",
           })
           .positive("Amount must be greater than zero"),
  network: z.enum(DEPOSIT_NETWORKS, { required_error: "Network is required" }),
  reason:  z.string().trim().min(1, "Reason is required").max(500, "Reason must be 500 characters or fewer"),
  notes:   z.string().trim().max(1000, "Notes must be 1000 characters or fewer").optional(),
});

// ── Deposit history (user-facing) ─────────────────────────────────────────────
export const depositHistoryQuerySchema = z.object({
  status:  z.enum(DEPOSIT_STATUSES).optional(),
  network: z.enum(DEPOSIT_NETWORKS).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

// ── Admin deposit list ────────────────────────────────────────────────────────
export const adminDepositListQuerySchema = z.object({
  status:    z.enum(DEPOSIT_STATUSES_ADMIN).optional(),
  network:   z.enum(DEPOSIT_NETWORKS).optional(),
  search:    z.string().trim().optional(),
  sortBy:    z.enum(["createdAt", "amount"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
});

// ── Reject deposit (admin) ────────────────────────────────────────────────────
export const rejectDepositSchema = z.object({
  rejectedReason: z.string().trim().min(1, "Rejection reason is required").max(500),
});

// ── Admin Wallet Credit ───────────────────────────────────────────────────────
// Used by POST /api/admin/wallets/credit (SUPER_ADMIN + FINANCE_ADMIN).
// Supports crediting depositWallet, incomeWallet, or withdrawalWallet directly.
export const walletCreditSchema = z.object({
  userId:     z.string().min(1, "User ID is required"),
  walletType: z.enum(["depositWallet", "incomeWallet", "withdrawalWallet"], {
                required_error: "Wallet type is required",
              }),
  amount:     z.number({
                required_error:    "Amount is required",
                invalid_type_error: "Amount must be a number",
              }).positive("Amount must be greater than zero"),
  reason:     z.string().trim().min(1, "Reason is required").max(500, "Reason must be 500 characters or fewer"),
  notes:      z.string().trim().max(1000, "Notes must be 1000 characters or fewer").optional(),
});

export type ManualAdminDepositInput = z.infer<typeof manualAdminDepositSchema>;
export type WalletCreditInput       = z.infer<typeof walletCreditSchema>;
export type DepositHistoryQuery     = z.infer<typeof depositHistoryQuerySchema>;
export type AdminDepositListQuery   = z.infer<typeof adminDepositListQuerySchema>;
export type RejectDepositInput      = z.infer<typeof rejectDepositSchema>;
