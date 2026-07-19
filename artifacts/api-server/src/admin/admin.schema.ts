import { z } from "zod";

export const updateUserWalletSchema = z.object({
  newWallet: z.string().min(10, "Wallet address must be at least 10 characters").max(150),
  reason:    z.string().min(5, "Reason must be at least 5 characters").max(500),
});

export const adminLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
