import { z } from "zod";

export const salaryHistoryQuerySchema = z.object({
  userId:   z.string().optional(),
  rankName: z.string().optional(),
  year:     z.coerce.number().int().min(2020).max(2100).optional(),
  month:    z.coerce.number().int().min(1).max(12).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

export const salarySummaryQuerySchema = z.object({
  userId: z.string().optional(),
});

export const salaryAchievementsQuerySchema = z.object({
  userId:   z.string().optional(),
  isActive: z.enum(["true", "false"]).optional().transform((v) =>
    v === undefined ? undefined : v === "true",
  ),
});

export type SalaryHistoryQuery        = z.infer<typeof salaryHistoryQuerySchema>;
export type SalarySummaryQuery        = z.infer<typeof salarySummaryQuerySchema>;
export type SalaryAchievementsQuery   = z.infer<typeof salaryAchievementsQuerySchema>;
