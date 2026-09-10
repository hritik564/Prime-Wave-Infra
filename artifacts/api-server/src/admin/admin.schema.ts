import { z } from "zod";

export const adminPasswordRules = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const updateUserWalletSchema = z.object({
  newWallet: z.string().min(10, "Wallet address must be at least 10 characters").max(150),
  reason:    z.string().min(5, "Reason must be at least 5 characters").max(500),
});

export const adminLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const changeAdminPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: adminPasswordRules,
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export const createStaffAdminSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Invalid email address"),
    password: adminPasswordRules,
    confirmPassword: z.string().min(1, "Please confirm the initial password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type ChangeAdminPasswordInput = z.infer<typeof changeAdminPasswordSchema>;
export type CreateStaffAdminInput = z.infer<typeof createStaffAdminSchema>;
