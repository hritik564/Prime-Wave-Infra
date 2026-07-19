-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260630125000_create_notification_type_enum
--
-- PURPOSE
--   Sprint 27 (20260630130000) adds values to NotificationType via ALTER TYPE,
--   but that enum was never created in any committed migration — it existed on
--   dev only because db:push created it first.  This migration slots between
--   sprint26e (20260630120000) and sprint27 (20260630130000) and creates the
--   base enum so that sprint27 can safely add its two additional values.
--
-- IDEMPOTENCY
--   The DO block silently ignores "type already exists" (duplicate_object).
--   Running this migration a second time is completely safe.
--
-- CONTAINS: 17 base values.
--   Sprint27 adds: DEPOSIT_VERIFICATION_DELAYED, DEPOSIT_FAILED.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM (
    'DEPOSIT_APPROVED',
    'DEPOSIT_REJECTED',
    'WITHDRAWAL_APPROVED',
    'WITHDRAWAL_COMPLETED',
    'WITHDRAWAL_REJECTED',
    'INVESTMENT_CREATED',
    'ROI_CLAIMED',
    'PRINCIPAL_RELEASED',
    'BINARY_MATCH_INCOME',
    'BINARY_ORBIT_INCOME',
    'LEVEL_INCOME',
    'SALARY_RECEIVED',
    'RANK_ACHIEVED',
    'PASSWORD_CHANGED',
    'WALLET_CHANGED',
    'ACCOUNT_BLOCKED',
    'ACCOUNT_SUSPENDED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
