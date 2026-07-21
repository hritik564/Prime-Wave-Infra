import { z } from "zod";

export const listRunsQuerySchema = z.object({
  month:  z.coerce.number().int().min(1).max(12).optional(),
  year:   z.coerce.number().int().min(2020).max(2100).optional(),
  status: z.string().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;

export const runIdParamSchema = z.object({
  runId: z.string().min(1),
});

export const createRunBodySchema = z.object({
  month: z.number().int().min(1).max(12),
  year:  z.number().int().min(2020).max(2100),
  notes: z.string().max(500).optional(),
});
export type CreateRunBody = z.infer<typeof createRunBodySchema>;

export const failRunBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
export type FailRunBody = z.infer<typeof failRunBodySchema>;

export const listRunIncomesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  rank:   z.string().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
});
export type ListRunIncomesQuery = z.infer<typeof listRunIncomesQuerySchema>;

export const incomeIdParamSchema = z.object({
  incomeId: z.string().min(1),
});

export const memberIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const exportQuerySchema = z.object({
  month:  z.coerce.number().int().min(1).max(12),
  year:   z.coerce.number().int().min(2020).max(2100),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;

export const exportMemberQuerySchema = z.object({
  userId: z.string().min(1),
});
export type ExportMemberQuery = z.infer<typeof exportMemberQuerySchema>;

export const memberHistoryQuerySchema = z.object({
  search: z.string().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});
export type MemberHistoryQuery = z.infer<typeof memberHistoryQuerySchema>;
