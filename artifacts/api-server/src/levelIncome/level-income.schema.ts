import { z } from "zod";

export const levelIncomeHistoryQuerySchema = z.object({
  userId:       z.string().optional(),
  sourceUserId: z.string().optional(),
  level:        z.coerce.number().int().min(1).max(5).optional(),
  page:         z.coerce.number().int().min(1).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
});

export const levelIncomeSummaryQuerySchema = z.object({
  userId: z.string().optional(),
});

export type LevelIncomeHistoryQuery = z.infer<typeof levelIncomeHistoryQuerySchema>;
export type LevelIncomeSummaryQuery = z.infer<typeof levelIncomeSummaryQuerySchema>;
