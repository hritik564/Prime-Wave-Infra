import { z } from "zod";

export const updateCompanyWalletParamSchema = z.object({
  id: z.string().min(1, "Wallet ID is required"),
});

const walletAddressSchema = z
  .string()
  .min(1, "Wallet address is required")
  .max(128, "Wallet address is too long")
  .transform((s) => s.trim());

const qrObjectPathSchema = z
  .string()
  .min(1, "QR image is required")
  .max(256, "QR image path is too long")
  .transform((s) => s.trim());

export const createCompanyWalletBodySchema = z.object({
  walletAddress: walletAddressSchema,
  qrObjectPath: qrObjectPathSchema,
});

export const updateCompanyWalletBodySchema = z.object({
  walletAddress: walletAddressSchema.optional(),
  qrObjectPath: qrObjectPathSchema.optional(),
}).refine((value) => value.walletAddress !== undefined || value.qrObjectPath !== undefined, {
  message: "Wallet address or QR image is required",
});

export const companyWalletUploadUrlSchema = z.object({
  name: z.string().min(1).max(128),
  size: z.number().int().positive().max(2 * 1024 * 1024),
  contentType: z.literal("image/png"),
});
