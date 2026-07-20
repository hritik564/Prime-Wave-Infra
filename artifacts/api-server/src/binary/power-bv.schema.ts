import { z } from "zod";

// ── Param ─────────────────────────────────────────────────────────────────────

export const powerBvUserIdParamSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

// ── Write operations ──────────────────────────────────────────────────────────

const MAX_BV_PER_OP = 10_000;
const MIN_REASON_LEN = 10;

const sharedFields = {
  side:   z.enum(["LEFT", "RIGHT"]),
  bv:     z
    .number({ required_error: "bv is required", invalid_type_error: "bv must be a number" })
    .int("bv must be a whole number")
    .positive("bv must be greater than 0")
    .max(MAX_BV_PER_OP, `bv cannot exceed ${MAX_BV_PER_OP} per operation`),
  reason: z
    .string({ required_error: "reason is required" })
    .min(MIN_REASON_LEN, `reason must be at least ${MIN_REASON_LEN} characters`),
};

export const powerBvAddSchema    = z.object(sharedFields);
export const powerBvRemoveSchema = z.object(sharedFields);

// ── List / ledger query ───────────────────────────────────────────────────────

export const powerBvLedgerQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  side:  z.enum(["LEFT", "RIGHT"]).optional(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type PowerBvAddInput    = z.infer<typeof powerBvAddSchema>;
export type PowerBvRemoveInput = z.infer<typeof powerBvRemoveSchema>;
export type PowerBvLedgerQuery = z.infer<typeof powerBvLedgerQuerySchema>;
