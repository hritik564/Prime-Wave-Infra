import { z } from "zod";

// ── Shared date-range filter ──────────────────────────────────────────────────

export const dateRangeSchema = z.object({
  from:  z.coerce.date().optional(),
  to:    z.coerce.date().optional(),
});

export const topListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginatedDateRangeSchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type DateRangeQuery       = z.infer<typeof dateRangeSchema>;
export type TopListQuery         = z.infer<typeof topListSchema>;
export type PaginatedDateRange   = z.infer<typeof paginatedDateRangeSchema>;
