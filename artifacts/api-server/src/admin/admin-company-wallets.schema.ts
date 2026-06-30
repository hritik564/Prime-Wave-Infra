import { z } from "zod";

export const updateCompanyWalletParamSchema = z.object({
  id: z.string().min(1, "Wallet ID is required"),
});

export const updateCompanyWalletBodySchema = z.object({
  walletAddress: z
    .string()
    .min(1, "Wallet address is required")
    .max(128, "Wallet address is too long")
    .transform((s) => s.trim()),
});
