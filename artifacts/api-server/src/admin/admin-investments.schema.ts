import { z } from "zod";
import { PLAN_TYPES, INVESTMENT_STATUSES } from "../investments/investments.schema";

export const adminInvestmentListQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  status:    z.enum(INVESTMENT_STATUSES).optional(),
  planType:  z.enum(PLAN_TYPES).optional(),
  search:    z.string().trim().optional(),
  sortBy:    z.enum(["createdAt", "amount"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type AdminInvestmentListQuery = z.infer<typeof adminInvestmentListQuerySchema>;
