import { z } from "zod";

export const orbitHistoryQuerySchema = z.object({
  userId: z.string().optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});

export const orbitSummaryQuerySchema = z.object({
  userId: z.string().optional(),
});

export type OrbitHistoryQuery = z.infer<typeof orbitHistoryQuerySchema>;
export type OrbitSummaryQuery = z.infer<typeof orbitSummaryQuerySchema>;
