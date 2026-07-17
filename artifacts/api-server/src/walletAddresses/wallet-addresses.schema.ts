import { z } from "zod";

export const WALLET_NETWORKS = ["BEP20"] as const;

export const addWalletAddressSchema = z.object({
  network: z.enum(WALLET_NETWORKS),
  address: z.string().trim().min(26, "Wallet address too short").max(62, "Wallet address too long"),
  label:   z.string().trim().max(50).optional(),
});

export const setWalletAddressPrimarySchema = z.object({
  network: z.enum(WALLET_NETWORKS),
});

export type AddWalletAddressInput      = z.infer<typeof addWalletAddressSchema>;
export type SetWalletAddressPrimaryInput = z.infer<typeof setWalletAddressPrimarySchema>;
