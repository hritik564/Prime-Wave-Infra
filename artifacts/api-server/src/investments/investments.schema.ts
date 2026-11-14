import { z } from "zod";

export const PLAN_TYPES = ["SINGLE"] as const;
export const INVESTMENT_STATUSES = ["ACTIVE", "MATURED", "COMPLETED"] as const;

/**
 * Plan config: dailyROI is stored as a percentage string (e.g. "0.5" = 0.5%/day).
 */
export const PLAN_CONFIG = {
  SINGLE: { durationDays: null, dailyROI: "0.8000" },
} as const satisfies Record<(typeof PLAN_TYPES)[number], { durationDays: number | null; dailyROI: string }>;

export const createInvestmentSchema = z.object({
  amount: z
    .number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .positive("Amount must be greater than zero")
    .refine((n) => Number.isInteger(n) && n % 100 === 0, {
      message: "Amount must be a whole-dollar multiple of $100 (e.g. 100, 200, 300)",
    }),
  planType: z.enum(PLAN_TYPES, {
    required_error: "Plan type is required",
    invalid_type_error: "Invalid plan type",
  }),
  autoCompound: z.boolean().optional().default(false),
});

export const listInvestmentsQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(INVESTMENT_STATUSES).optional(),
});

export const toggleAutoCompoundSchema = z.object({
  autoCompound: z.boolean({ required_error: "autoCompound (boolean) is required" }),
});

export type CreateInvestmentInput    = z.infer<typeof createInvestmentSchema>;
export type ListInvestmentsQuery     = z.infer<typeof listInvestmentsQuerySchema>;
export type ToggleAutoCompoundInput  = z.infer<typeof toggleAutoCompoundSchema>;
