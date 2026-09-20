import { z } from "zod";

export const BULK_RESET_CONFIRMATION = "RESET ALL NORMAL USER PASSWORDS";

export const bulkPasswordResetExecuteSchema = z.object({
  confirmation: z.string(),
  expectedUserCount: z.number().int().min(0),
  runId: z.string().cuid().optional(),
});

export type BulkPasswordResetExecuteInput = z.infer<typeof bulkPasswordResetExecuteSchema>;