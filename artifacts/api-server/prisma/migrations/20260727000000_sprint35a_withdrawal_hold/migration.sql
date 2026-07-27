-- Sprint 35A + schema sync: comprehensive migration covering all outstanding schema drift.
-- All statements are guarded with IF NOT EXISTS / IF EXISTS / DO-EXCEPTION so the
-- migration is safe to apply on any environment regardless of prior direct DDL.
--
-- Enums touched:
--   WithdrawalStatus  → ADD VALUE 'UNDER_REVIEW'  (IF NOT EXISTS)
--   PowerBvOperation  → CREATE (new enum, IF NOT EXISTS)
--   TransactionType       — NOT touched; POWER_BV_RECOVERY already present via 20260723000000
--   LedgerTransactionType — NOT touched; POWER_BV_RECOVERY already present via 20260723000000

-- ─── 1. New enum: PowerBvOperation ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PowerBvOperation" AS ENUM ('ADD', 'REMOVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Add UNDER_REVIEW to WithdrawalStatus ─────────────────────────────────
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';

-- ─── 3. Drop salary foreign keys (re-added below with correct ON DELETE rules) ─
ALTER TABLE "salary_income"       DROP CONSTRAINT IF EXISTS "salary_income_salaryRunId_fkey";
ALTER TABLE "salary_payout_event" DROP CONSTRAINT IF EXISTS "salary_payout_event_salaryIncomeId_fkey";
ALTER TABLE "salary_payout_event" DROP CONSTRAINT IF EXISTS "salary_payout_event_userId_fkey";
ALTER TABLE "salary_run_audit"    DROP CONSTRAINT IF EXISTS "salary_run_audit_salaryRunId_fkey";

-- ─── 4. Drop obsolete unique index on salary_income ──────────────────────────
DROP INDEX IF EXISTS "salary_income_userId_rankName_month_year_key";

-- ─── 5. Add new columns to users ─────────────────────────────────────────────
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "powerLeftBV"         DECIMAL(18,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "powerRightBV"        DECIMAL(18,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "withdrawalHold"       BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "withdrawalHoldAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "withdrawalHoldBy"    TEXT,
  ADD COLUMN IF NOT EXISTS "withdrawalHoldReason" TEXT;

-- ─── 6. Drop default on withdrawal_requests.idempotencyKey ───────────────────
DO $$ BEGIN
  ALTER TABLE "withdrawal_requests" ALTER COLUMN "idempotencyKey" DROP DEFAULT;
EXCEPTION WHEN others THEN NULL; END $$;

-- ─── 7. Create power_bv_ledger table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "power_bv_ledger" (
    "id"            TEXT           NOT NULL,
    "userId"        TEXT           NOT NULL,
    "adminId"       TEXT           NOT NULL,
    "side"          "BinaryPosition" NOT NULL,
    "operation"     "PowerBvOperation" NOT NULL,
    "bv"            DECIMAL(18,8)  NOT NULL,
    "balanceBefore" DECIMAL(18,8)  NOT NULL,
    "balanceAfter"  DECIMAL(18,8)  NOT NULL,
    "reason"        TEXT           NOT NULL,
    "metadata"      JSONB,
    "createdAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "power_bv_ledger_pkey" PRIMARY KEY ("id")
);

-- ─── 8. Indexes on power_bv_ledger ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "power_bv_ledger_userId_idx"    ON "power_bv_ledger"("userId");
CREATE INDEX IF NOT EXISTS "power_bv_ledger_adminId_idx"   ON "power_bv_ledger"("adminId");
CREATE INDEX IF NOT EXISTS "power_bv_ledger_createdAt_idx" ON "power_bv_ledger"("createdAt");

-- ─── 9. Re-add salary foreign keys ───────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "salary_income" ADD CONSTRAINT "salary_income_salaryRunId_fkey"
    FOREIGN KEY ("salaryRunId") REFERENCES "salary_run"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salary_payout_event" ADD CONSTRAINT "salary_payout_event_salaryIncomeId_fkey"
    FOREIGN KEY ("salaryIncomeId") REFERENCES "salary_income"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salary_payout_event" ADD CONSTRAINT "salary_payout_event_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salary_run_audit" ADD CONSTRAINT "salary_run_audit_salaryRunId_fkey"
    FOREIGN KEY ("salaryRunId") REFERENCES "salary_run"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 10. Foreign keys on power_bv_ledger ─────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "power_bv_ledger" ADD CONSTRAINT "power_bv_ledger_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "power_bv_ledger" ADD CONSTRAINT "power_bv_ledger_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "admins"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
