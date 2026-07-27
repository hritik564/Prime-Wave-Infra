-- Sprint 35A: Withdrawal Hold
-- Safe to run on any environment; IF NOT EXISTS guards prevent re-run errors.

-- 1. Add UNDER_REVIEW to WithdrawalStatus enum
DO $$ BEGIN
  ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Add withdrawal hold fields to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "withdrawalHold"       BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "withdrawalHoldReason" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "withdrawalHoldBy"     TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "withdrawalHoldAt"     TIMESTAMP(3);
