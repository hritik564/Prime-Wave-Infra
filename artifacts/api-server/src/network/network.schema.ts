import { z } from "zod";

export const membersQuerySchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(50).default(20),
  search: z.string().optional().default(""),
  filter: z
    .enum(["all", "active", "inactive", "sponsored", "no-plan", "high-producers", "recently-active"])
    .default("all"),
});

export type MembersQuery = z.infer<typeof membersQuerySchema>;
