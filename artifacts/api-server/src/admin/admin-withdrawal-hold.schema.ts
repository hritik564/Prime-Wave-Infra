import { z } from "zod";

export const setWithdrawalHoldSchema = z.object({
  hold:   z.boolean(),
  reason: z.string().trim().max(500).optional().default(""),
});

export type SetWithdrawalHoldInput = z.infer<typeof setWithdrawalHoldSchema>;
