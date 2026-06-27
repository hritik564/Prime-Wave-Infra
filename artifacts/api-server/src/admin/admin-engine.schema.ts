import { z } from "zod";

export const engineIdParamSchema = z.object({
  engineId: z.enum(["roi", "binary", "orbit", "salary", "level", "release", "notify"]),
});

export const saveEngineNotesBodySchema = z.object({
  notes: z.string().max(2000),
});
