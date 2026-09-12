import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.string().default("12"),
  MAINTENANCE_MODE: z.string().default("false"),

  // ── Blockchain Gateway (optional — server starts without them) ──────────────
  HOT_WALLET_ADDRESS:    z.string().optional(),
  BLOCKCHAIN_DRY_RUN:    z.string().default("true"),
  // HOT_WALLET_PRIVATE_KEY — Sprint 31C only; intentionally excluded here

  // ── Withdrawal Operational Controls (Sprint 31E) ───────────────────────────
  // Hold period: how many minutes a new withdrawal waits before the processor
  // picks it up. During this window users may cancel. Default = 2 minutes.
  WITHDRAWAL_HOLD_MINUTES: z.string().default("2"),

  // Risk limits — if exceeded, withdrawal is moved to MANUAL_REVIEW (not failed).
  // Unset = no limit enforced.
  MAX_SINGLE_WITHDRAWAL:         z.string().optional(),
  MAX_DAILY_WITHDRAWAL_PER_USER: z.string().optional(),
  MAX_HOURLY_WITHDRAWALS_PER_USER: z.string().optional(),

  // Hot wallet minimum balances — processing pauses if either falls below.
  MIN_HOT_WALLET_BNB:  z.string().default("0.05"),
  MIN_HOT_WALLET_USDT: z.string().default("1"),
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
