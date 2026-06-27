import { z } from "zod";

export const adminWalletListQuerySchema = z.object({
  search:    z.string().trim().max(100).optional(),
  status:    z.enum(["ACTIVE", "LOCKED", "FROZEN", "FLAGGED"]).optional(),
  sortBy:    z.enum(["depositWallet", "incomeWallet", "withdrawalWallet", "updatedAt"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(25),
});

export const saveWalletNotesSchema = z.object({
  notes: z.string().trim().max(5000),
});

export type AdminWalletListQuery  = z.infer<typeof adminWalletListQuerySchema>;
export type SaveWalletNotesInput  = z.infer<typeof saveWalletNotesSchema>;
