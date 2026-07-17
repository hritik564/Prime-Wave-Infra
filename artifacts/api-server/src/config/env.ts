import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.string().default("12"),

  // ── Blockchain Gateway (optional — server starts without them) ──────────────
  HOT_WALLET_ADDRESS:    z.string().optional(),
  BLOCKCHAIN_DRY_RUN:    z.string().default("true"),
  // HOT_WALLET_PRIVATE_KEY — Sprint 31C only; intentionally excluded here
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
