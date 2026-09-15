import { getBscConfig } from "../deposit-verification/adapter/bsc/bsc-config";

/**
 * Single source of truth for automatic withdrawal confirmation depth.
 * Recovery and polling must use this helper rather than reading a second
 * legacy environment variable.
 */
export function getWithdrawalRequiredConfirmations(): number {
  return getBscConfig().requiredConfirmations;
}

export const WITHDRAWAL_DEFAULT_CONFIRMATIONS = 12;