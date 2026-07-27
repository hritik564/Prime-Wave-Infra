import { z } from "zod";

export const setWithdrawalHoldSchema = z.object({
  hold:   z.boolean(),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(500),
});

export type SetWithdrawalHoldInput = z.infer<typeof setWithdrawalHoldSchema>;
