-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260723000000_p0_power_bv_recovery_type
--
-- PURPOSE
--   P0 Financial Audit — Power BV Overpayment Recovery
--   Adds POWER_BV_RECOVERY to TransactionType and LedgerTransactionType enums
--   so recovery debit entries can be recorded with a dedicated transaction type
--   that is distinct from normal wallet operations.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'POWER_BV_RECOVERY';
ALTER TYPE "LedgerTransactionType" ADD VALUE IF NOT EXISTS 'POWER_BV_RECOVERY';
