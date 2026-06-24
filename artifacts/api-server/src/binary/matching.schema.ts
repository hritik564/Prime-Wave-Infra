import { z } from "zod";

export const matchingHistoryQuerySchema = z.object({
  userId: z.string().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});

export const matchingSummaryQuerySchema = z.object({
  userId: z.string().optional(),
});

export type MatchingHistoryQuery = z.infer<typeof matchingHistoryQuerySchema>;
export type MatchingSummaryQuery = z.infer<typeof matchingSummaryQuerySchema>;
