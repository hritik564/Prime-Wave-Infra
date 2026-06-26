import { z } from "zod";

export const membersQuerySchema = z.object({
  page:   z.coerce.number().int().positive().default(1),
  limit:  z.coerce.number().int().positive().max(50).default(20),
  search: z.string().optional().default(""),
  filter: z.enum([
    "all", "active", "inactive",
    "sponsored",      // personally sponsored by viewer
    "spillover",      // in downline but not directly sponsored
    "new",            // joined last 7 days
    "high_producers", // directReferralCount >= 2
    "vip",            // active + invested + refs >= 2
  ]).default("all"),
  sort: z.enum(["recent", "highest_investment", "highest_bv"]).default("recent"),
});

export type MembersQuery = z.infer<typeof membersQuerySchema>;
