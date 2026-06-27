import { z } from "zod";

export const saveConfigFieldSchema = z.object({
  value:    z.string().min(1).max(500),
  oldValue: z.string().max(500).optional().default(""),
  reason:   z.string().min(3).max(500),
  label:    z.string().max(200).optional().default(""),
});

export const configKeyParamSchema = z.object({
  key: z.string().min(1).max(200),
});

export const createPlanSchema = z.object({
  name:         z.string().min(1).max(100),
  color:        z.string().max(30).optional().default("#60a5fa"),
  minInvest:    z.number().positive(),
  maxInvest:    z.number().positive().nullable(),
  roi:          z.number().positive().max(100),
  duration:     z.number().int().positive(),
  autoCompound: z.boolean(),
  benefits:     z.array(z.string().max(200)).optional().default([]),
  notes:        z.string().max(500).optional().default(""),
  claimWindow:  z.string().max(50).optional().default("24 hours"),
});

export const planIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updatePlanStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
});

export const saveLevelConfigSchema = z.object({
  levels: z.array(z.object({
    level:         z.number().int().min(1).max(20),
    rate:          z.number().min(0).max(100),
    qualification: z.string().max(200),
    status:        z.enum(["ACTIVE", "INACTIVE"]),
  })),
});
