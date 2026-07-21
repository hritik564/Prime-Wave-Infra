-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260721120000_sprint33p_schema_sync
--
-- PURPOSE
--   Brings the production database into full alignment with the Prisma schema
--   as of Sprint 33P.  Captures all schema changes introduced in Sprints 33E–33K
--   that were previously applied only via db:push in development.
--
-- CHANGES
--   §1  New enum types
--         SalaryIncomeStatus       (PENDING | APPROVED | PAID)
--         SalaryRunStatus          (GENERATING | GENERATED | APPROVING |
--                                   APPROVED | PAYING | COMPLETED | FAILED)
--         SalaryPayoutEventType    (APPROVED | PAID)
--         SalaryRunAuditAction     (RUN_CREATED | GENERATION_COMPLETED |
--                                   APPROVAL_STARTED | APPROVAL_COMPLETED |
--                                   PAYOUT_STARTED | PAYOUT_COMPLETED | RUN_FAILED)
--   §2  salary_income: 7 new columns, unique-constraint swap, 3 new indexes
--   §3  New table: salary_run
--   §4  New table: salary_run_audit
--   §5  New table: salary_payout_event
--   §6  FK: salary_income.salaryRunId → salary_run.id  (SET NULL)
--   §7  FKs: salary_payout_event → salary_income / users  (RESTRICT)
--   §8  FK: salary_run_audit.salaryRunId → salary_run.id  (RESTRICT)
--   §9  Data backfill: set existing salary_income rows to status = PENDING
--
-- SAFETY GUARANTEES
--   • No TRUNCATE or DROP TABLE anywhere in this file.
--   • Every CREATE TABLE uses IF NOT EXISTS — idempotent.
--   • Every CREATE INDEX uses IF NOT EXISTS — idempotent.
--   • Every ADD COLUMN uses IF NOT EXISTS — idempotent.
--   • Every new enum uses DO/EXCEPTION block — idempotent on re-run.
--   • Constraint drop is guarded with IF EXISTS — no-op if already removed.
--   • FK constraints are guarded with IF NOT EXISTS logic via DO blocks.
--   • Data backfill uses WHERE clause — no-op on re-run.
--
-- EXECUTION ORDER (dependency-safe)
--   §1  Enums                (no dependencies)
--   §2  salary_income cols   (depends on §1 for SalaryIncomeStatus)
--   §3  salary_run           (depends on §1 for SalaryRunStatus)
--   §4  salary_run_audit     (depends on §1 for SalaryRunAuditAction; FK added in §8)
--   §5  salary_payout_event  (depends on §1 for SalaryPayoutEventType; FKs in §7)
--   §6  salary_income FK     (depends on §3 salary_run existing)
--   §7  salary_payout_event FKs  (depends on §2 salary_income & users existing)
--   §8  salary_run_audit FK  (depends on §3 salary_run existing)
--   §9  Data backfill        (depends on §2 status column existing)
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1  NEW ENUM TYPES
-- ═════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "SalaryIncomeStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalaryRunStatus" AS ENUM (
    'GENERATING',
    'GENERATED',
    'APPROVING',
    'APPROVED',
    'PAYING',
    'COMPLETED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalaryPayoutEventType" AS ENUM ('APPROVED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SalaryRunAuditAction" AS ENUM (
    'RUN_CREATED',
    'GENERATION_COMPLETED',
    'APPROVAL_STARTED',
    'APPROVAL_COMPLETED',
    'PAYOUT_STARTED',
    'PAYOUT_COMPLETED',
    'RUN_FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §2  salary_income — ADD COLUMNS / SWAP UNIQUE CONSTRAINT / ADD INDEXES
-- ═════════════════════════════════════════════════════════════════════════════

-- New columns (all idempotent with IF NOT EXISTS)
ALTER TABLE "salary_income"
  ADD COLUMN IF NOT EXISTS "status"        "SalaryIncomeStatus"  NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "reference"     TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedBy"    TEXT,
  ADD COLUMN IF NOT EXISTS "paidAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "transactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "salaryRunId"   TEXT;

-- Drop the old unique constraint that included rankName.
-- Guard: IF EXISTS means this is a no-op if the constraint was already removed.
ALTER TABLE "salary_income"
  DROP CONSTRAINT IF EXISTS "salary_income_userId_rankName_month_year_key";

-- Add the new narrowed unique constraint (one income per member per month).
-- Guard via DO block: no-op if already present.
DO $$ BEGIN
  ALTER TABLE "salary_income"
    ADD CONSTRAINT "salary_income_userId_month_year_key"
    UNIQUE ("userId", "month", "year");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- New indexes on salary_income
CREATE INDEX IF NOT EXISTS "salary_income_status_idx"
  ON "salary_income" ("status");

CREATE INDEX IF NOT EXISTS "salary_income_salaryRunId_idx"
  ON "salary_income" ("salaryRunId");

CREATE INDEX IF NOT EXISTS "salary_income_createdAt_idx"
  ON "salary_income" ("createdAt");


-- ═════════════════════════════════════════════════════════════════════════════
-- §3  CREATE TABLE: salary_run
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "salary_run" (
  "id"             TEXT             NOT NULL,
  "month"          INTEGER          NOT NULL,
  "year"           INTEGER          NOT NULL,
  "status"         "SalaryRunStatus" NOT NULL DEFAULT 'GENERATING',
  "startedAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  "generatedCount" INTEGER          NOT NULL DEFAULT 0,
  "approvedCount"  INTEGER          NOT NULL DEFAULT 0,
  "paidCount"      INTEGER          NOT NULL DEFAULT 0,
  "failedCount"    INTEGER          NOT NULL DEFAULT 0,
  "totalAmount"    DECIMAL(18,2)    NOT NULL DEFAULT 0,
  "createdBy"      TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "salary_run_pkey" PRIMARY KEY ("id")
);

-- Unique: one run per (month, year)
DO $$ BEGIN
  ALTER TABLE "salary_run"
    ADD CONSTRAINT "salary_run_month_year_key" UNIQUE ("month", "year");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "salary_run_status_idx"
  ON "salary_run" ("status");

CREATE INDEX IF NOT EXISTS "salary_run_year_month_idx"
  ON "salary_run" ("year", "month");


-- ═════════════════════════════════════════════════════════════════════════════
-- §4  CREATE TABLE: salary_run_audit
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "salary_run_audit" (
  "id"          TEXT                   NOT NULL,
  "salaryRunId" TEXT                   NOT NULL,
  "action"      "SalaryRunAuditAction" NOT NULL,
  "performedBy" TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "salary_run_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salary_run_audit_salaryRunId_idx"
  ON "salary_run_audit" ("salaryRunId");

CREATE INDEX IF NOT EXISTS "salary_run_audit_action_idx"
  ON "salary_run_audit" ("action");


-- ═════════════════════════════════════════════════════════════════════════════
-- §5  CREATE TABLE: salary_payout_event
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "salary_payout_event" (
  "id"             TEXT                   NOT NULL,
  "salaryIncomeId" TEXT                   NOT NULL,
  "userId"         TEXT                   NOT NULL,
  "eventType"      "SalaryPayoutEventType" NOT NULL,
  "performedBy"    TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "salary_payout_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salary_payout_event_salaryIncomeId_idx"
  ON "salary_payout_event" ("salaryIncomeId");

CREATE INDEX IF NOT EXISTS "salary_payout_event_userId_idx"
  ON "salary_payout_event" ("userId");

CREATE INDEX IF NOT EXISTS "salary_payout_event_eventType_idx"
  ON "salary_payout_event" ("eventType");


-- ═════════════════════════════════════════════════════════════════════════════
-- §6  FK: salary_income.salaryRunId → salary_run.id  (SET NULL on delete)
-- ═════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE "salary_income"
    ADD CONSTRAINT "salary_income_salaryRunId_fkey"
    FOREIGN KEY ("salaryRunId")
    REFERENCES "salary_run" ("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §7  FKs: salary_payout_event → salary_income / users
-- ═════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE "salary_payout_event"
    ADD CONSTRAINT "salary_payout_event_salaryIncomeId_fkey"
    FOREIGN KEY ("salaryIncomeId")
    REFERENCES "salary_income" ("id")
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salary_payout_event"
    ADD CONSTRAINT "salary_payout_event_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "users" ("id")
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §8  FK: salary_run_audit.salaryRunId → salary_run.id  (RESTRICT on delete)
-- ═════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE "salary_run_audit"
    ADD CONSTRAINT "salary_run_audit_salaryRunId_fkey"
    FOREIGN KEY ("salaryRunId")
    REFERENCES "salary_run" ("id")
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §9  DATA BACKFILL
-- ═════════════════════════════════════════════════════════════════════════════

-- All pre-existing salary_income rows are historical (pre-SalaryRun era).
-- They have no associated SalaryRun, no approval, and no payout record.
-- Setting status = PENDING is semantically correct: they are historical records
-- that predate the approval/payout workflow.  The WHERE guard makes this a
-- no-op on re-run (rows already set to APPROVED or PAID are untouched).
UPDATE "salary_income"
  SET "status" = 'PENDING'
  WHERE "status" = 'PENDING'
    AND "salaryRunId" IS NULL;
