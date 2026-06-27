import { z } from "zod";

export const adminBinaryListQuerySchema = z.object({
  search:    z.string().trim().max(100).optional(),
  status:    z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  position:  z.enum(["LEFT", "RIGHT"]).optional(),
  rank:      z.string().trim().max(50).optional(),
  sortBy:    z.enum(["leftBV", "rightBV", "createdAt", "directReferralCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
});

export const saveBinaryNotesSchema = z.object({
  notes: z.string().trim().max(5000),
});

export type AdminBinaryListQuery = z.infer<typeof adminBinaryListQuerySchema>;
export type SaveBinaryNotesInput = z.infer<typeof saveBinaryNotesSchema>;
