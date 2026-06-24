import { z } from "zod";

export const bvSummaryQuerySchema = z.object({
  userId: z.string().optional(),
});

export const bvHistoryQuerySchema = z.object({
  userId:       z.string().optional(),
  investmentId: z.string().optional(),
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
});

export type BvSummaryQuery = z.infer<typeof bvSummaryQuerySchema>;
export type BvHistoryQuery = z.infer<typeof bvHistoryQuerySchema>;
