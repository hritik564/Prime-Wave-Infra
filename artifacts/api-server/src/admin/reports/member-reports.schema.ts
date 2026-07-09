import { z } from "zod";

export const memberReportQuerySchema = z.object({
  // Date range
  from:   z.coerce.date().optional(),
  to:     z.coerce.date().optional(),
  preset: z.enum(["today","yesterday","last7","last30","thisMonth","lastMonth"]).optional(),

  // Filters
  status:            z.enum(["ACTIVE","INACTIVE","SUSPENDED","BLOCKED"]).optional(),
  operationalStatus: z.enum(["ACTIVE","INACTIVE"]).optional(),
  hasInvestment:     z.enum(["yes","no"]).optional(),
  placement:         z.enum(["LEFT","RIGHT"]).optional(),
  accountType:       z.enum(["master","mi","rd","sp","normal"]).optional(),

  // Search
  search: z.string().optional(),

  // Pagination
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const memberExportQuerySchema = memberReportQuerySchema.omit({ page: true, limit: true });

export type MemberReportQuery = z.infer<typeof memberReportQuerySchema>;
export type MemberExportQuery = z.infer<typeof memberExportQuerySchema>;
