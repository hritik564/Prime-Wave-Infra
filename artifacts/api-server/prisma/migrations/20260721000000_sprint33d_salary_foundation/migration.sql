-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260721000000_sprint33d_salary_foundation
--
-- PURPOSE
--   Establishes the database foundation for the new Salary Engine.
--   Adds SalaryBusinessSummary (1:1 with User), SalaryBusinessEvent (immutable
--   audit log), and the qualificationPool column on SalaryRankConfig.
--
-- SAFETY GUARANTEES
--   • No TRUNCATE, DROP TABLE, or DROP COLUMN anywhere in this file.
--   • Every CREATE TABLE uses IF NOT EXISTS — idempotent.
--   • Every CREATE INDEX uses IF NOT EXISTS — idempotent.
--   • Every ADD COLUMN uses IF NOT EXISTS — idempotent.
--   • Every new enum type uses DO/EXCEPTION block — idempotent.
--   • Backfill INSERT uses ON CONFLICT DO NOTHING — idempotent on re-run.
--   • UPDATE backfills guard with WHERE clause — no-op on already-set rows.
--
-- EXECUTION ORDER (dependency-safe)
--   §1  New enum types
--   §2  New column on existing table  (qualificationPool → salary_rank_config)
--   §3  New tables and indexes        (salary_business_summary, salary_business_event)
--   §4  Foreign key constraints
--   §5  Data backfill
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1  NEW ENUM TYPES
-- ═════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "SalaryPool" AS ENUM ('DIRECT', 'DOWNLINE', 'POWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalaryEventType" AS ENUM (
    'INVESTMENT_CREATED',
    'INVESTMENT_CANCELLED',
    'INVESTMENT_REFUNDED',
    'POWER_BV_ADDED',
    'POWER_BV_REMOVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalaryQualificationPool" AS ENUM ('DIRECT_ONLY', 'ALL_BUSINESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §2  NEW COLUMN ON EXISTING TABLE
-- ═════════════════════════════════════════════════════════════════════════════

-- Add qualificationPool to salary_rank_config.
-- Default = DIRECT_ONLY so all existing rows are valid immediately.
ALTER TABLE "salary_rank_config"
  ADD COLUMN IF NOT EXISTS "qualificationPool" "SalaryQualificationPool"
    NOT NULL DEFAULT 'DIRECT_ONLY';


-- ═════════════════════════════════════════════════════════════════════════════
-- §3  NEW TABLES AND INDEXES
-- ═════════════════════════════════════════════════════════════════════════════

-- ── SalaryBusinessSummary ─────────────────────────────────────────────────────
-- 1-to-1 with User.  Mirrors the Wallet table pattern.
-- One row per user, created atomically with the user (or backfilled here).
CREATE TABLE IF NOT EXISTS "salary_business_summary" (
    "id"               TEXT           NOT NULL,
    "userId"           TEXT           NOT NULL,
    "directBusiness"   DECIMAL(18,8)  NOT NULL DEFAULT 0,
    "downlineBusiness" DECIMAL(18,8)  NOT NULL DEFAULT 0,
    "powerBusiness"    DECIMAL(18,8)  NOT NULL DEFAULT 0,
    "lastReconciledAt" TIMESTAMP(3),
    "version"          INTEGER        NOT NULL DEFAULT 1,
    "createdAt"        TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "salary_business_summary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "salary_business_summary_userId_key"
    ON "salary_business_summary"("userId");

CREATE INDEX IF NOT EXISTS "salary_business_summary_userId_idx"
    ON "salary_business_summary"("userId");

-- ── SalaryBusinessEvent ───────────────────────────────────────────────────────
-- Immutable audit trail.  NEVER update.  NEVER delete.
-- Unique constraint (userId, pool, referenceId, eventType) ensures idempotency.
CREATE TABLE IF NOT EXISTS "salary_business_event" (
    "id"            TEXT              NOT NULL,
    "userId"        TEXT              NOT NULL,
    "sourceUserId"  TEXT,
    "pool"          "SalaryPool"      NOT NULL,
    "eventType"     "SalaryEventType" NOT NULL,
    "delta"         DECIMAL(18,8)     NOT NULL,
    "referenceId"   TEXT              NOT NULL,
    "referenceType" TEXT              NOT NULL,
    "depth"         INTEGER,
    "metadata"      JSONB,
    "createdAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_business_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "salary_business_event_userId_pool_referenceId_eventType_key"
    ON "salary_business_event"("userId", "pool", "referenceId", "eventType");

CREATE INDEX IF NOT EXISTS "salary_business_event_userId_idx"
    ON "salary_business_event"("userId");

CREATE INDEX IF NOT EXISTS "salary_business_event_sourceUserId_idx"
    ON "salary_business_event"("sourceUserId");

CREATE INDEX IF NOT EXISTS "salary_business_event_referenceId_idx"
    ON "salary_business_event"("referenceId");

CREATE INDEX IF NOT EXISTS "salary_business_event_createdAt_idx"
    ON "salary_business_event"("createdAt");


-- ═════════════════════════════════════════════════════════════════════════════
-- §4  FOREIGN KEY CONSTRAINTS
-- ═════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE "salary_business_summary"
    ADD CONSTRAINT "salary_business_summary_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salary_business_event"
    ADD CONSTRAINT "salary_business_event_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salary_business_event"
    ADD CONSTRAINT "salary_business_event_sourceUserId_fkey"
      FOREIGN KEY ("sourceUserId") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §5  DATA BACKFILL
-- ═════════════════════════════════════════════════════════════════════════════

-- ── SalaryBusinessSummary: one row per existing user ─────────────────────────
-- ON CONFLICT DO NOTHING makes this a no-op on re-run.
-- gen_random_uuid()::text produces a cuid-compatible unique id.
INSERT INTO "salary_business_summary"
  ("id", "userId", "directBusiness", "downlineBusiness", "powerBusiness",
   "lastReconciledAt", "version", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  0,
  0,
  0,
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("userId") DO NOTHING;

-- ── SalaryRankConfig: set qualificationPool for all known ranks ───────────────
-- Bronze / Silver / Gold → DIRECT_ONLY (already the column default)
-- Platinum and above     → ALL_BUSINESS
-- Guard: only update rows where the value is still the default, so a re-run
-- that already set the correct value is a no-op.
UPDATE "salary_rank_config"
SET    "qualificationPool" = 'ALL_BUSINESS'
WHERE  "rankName" IN ('Platinum', 'Sapphire', 'Ruby', 'Emerald',
                      'Diamond', 'Ambassador', 'Sovereign Crown')
  AND  "qualificationPool" = 'DIRECT_ONLY';
