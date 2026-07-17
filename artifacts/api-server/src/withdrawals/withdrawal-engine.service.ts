import { getSetting, setSetting } from "../config/settings";
import { logger } from "../lib/logger";

// ── Withdrawal Engine Switch ───────────────────────────────────────────────────
//
// Stored in system_settings key "withdrawal_engine_enabled".
// Default: "true" (enabled).  Set to "false" or "0" to pause processing.
//
// When OFF:
//   - New withdrawal requests are still accepted
//   - Queue processing is suspended
//   - Confirmation polling continues
//   - Recovery services continue

const ENGINE_KEY = "withdrawal_engine_enabled";

export async function isWithdrawalEngineEnabled(): Promise<boolean> {
  const val = await getSetting(ENGINE_KEY, "true");
  return val.toLowerCase() !== "false" && val !== "0";
}

export async function setWithdrawalEngineEnabled(
  enabled:  boolean,
  adminId?: string,
): Promise<void> {
  await setSetting(ENGINE_KEY, enabled ? "true" : "false");

  logger.info(
    { enabled, adminId },
    enabled
      ? "WithdrawalEngine: engine ENABLED — queue processing resumed"
      : "WithdrawalEngine: engine DISABLED — queue processing paused",
  );
}

export interface WithdrawalEngineStatus {
  enabled:     boolean;
  description: string;
}

export async function getWithdrawalEngineStatus(): Promise<WithdrawalEngineStatus> {
  const enabled = await isWithdrawalEngineEnabled();
  return {
    enabled,
    description: enabled
      ? "Withdrawal processing is active"
      : "Withdrawal processing is paused — new withdrawals are accepted but not processed",
  };
}
