import { z } from "zod";

export const DEPOSIT_NETWORKS = ["BEP20", "ERC20", "TRC20", "SOL"] as const;
export const DEPOSIT_STATUSES  = ["PENDING", "APPROVED", "REJECTED"] as const;

export const createDepositSchema = z.object({
  amount:        z.coerce.number()
                   .positive("Amount must be positive")
                   .multipleOf(100, "Amount must be a multiple of $100"),
  network:       z.enum(DEPOSIT_NETWORKS),
  txHash:        z.string().trim().min(1, "Transaction hash is required"),
  screenshotUrl: z.string().url("Invalid screenshot URL").optional(),
  companyWallet: z.string().trim().min(1, "Company wallet address is required"),
});

export const depositHistoryQuerySchema = z.object({
  status:  z.enum(DEPOSIT_STATUSES).optional(),
  network: z.enum(DEPOSIT_NETWORKS).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

export const adminDepositListQuerySchema = z.object({
  network: z.enum(DEPOSIT_NETWORKS).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

export const rejectDepositSchema = z.object({
  rejectedReason: z.string().trim().min(1, "Rejection reason is required").max(500),
});

export type CreateDepositInput       = z.infer<typeof createDepositSchema>;
export type DepositHistoryQuery      = z.infer<typeof depositHistoryQuerySchema>;
export type AdminDepositListQuery    = z.infer<typeof adminDepositListQuerySchema>;
export type RejectDepositInput       = z.infer<typeof rejectDepositSchema>;
