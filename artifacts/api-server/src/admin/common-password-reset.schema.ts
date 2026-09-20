import { z } from "zod";

export const COMMON_PASSWORD_RESET_CONFIRMATION =
  "SET COMMON TEMPORARY PASSWORD FOR ALL NORMAL USERS";
export const COMMON_PASSWORD_RESET_EMERGENCY_RUN_ID =
  "cmua3jcec001wa99zi17pz3hl";
export const COMMON_PASSWORD_RESET_EMERGENCY_STOP_CONFIRMATION =
  "STOP COMMON TEMPORARY PASSWORD RESET FOR PERFORMANCE RECOVERY";

export const commonPasswordResetExecuteSchema = z.object({
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(1).max(128),
  confirmation: z.literal(COMMON_PASSWORD_RESET_CONFIRMATION),
  expectedUserCount: z.number().int().min(0),
  runId: z.string().cuid().optional(),
});

export type CommonPasswordResetExecuteInput = z.infer<
  typeof commonPasswordResetExecuteSchema
>;

export const commonPasswordResetEmergencyStopSchema = z.object({
  confirmation: z.literal(COMMON_PASSWORD_RESET_EMERGENCY_STOP_CONFIRMATION),
});

export type CommonPasswordResetEmergencyStopInput = z.infer<
  typeof commonPasswordResetEmergencyStopSchema
>;