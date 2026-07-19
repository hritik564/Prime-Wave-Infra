-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260720000000_sprint32_production_catchup
--
-- PURPOSE
--   Closes every gap between the 20 committed migrations (production baseline)
--   and the current schema.prisma.  Eliminates 59 drift items with zero data
--   loss and zero destructive operations.
--
-- SAFETY GUARANTEES
--   • No TRUNCATE, DROP TABLE, or DROP COLUMN anywhere in this file.
--   • Every ADD COLUMN uses IF NOT EXISTS — safe to resume after interruption.
--   • Every CREATE TABLE uses IF NOT EXISTS — idempotent.
--   • Every CREATE INDEX uses IF NOT EXISTS — idempotent.
--   • Every ALTER TYPE ADD VALUE uses IF NOT EXISTS — idempotent.
--   • Every backfill UPDATE guards with WHERE <col> IS NULL so re-runs are
--     no-ops on already-populated rows.
--   • New enum types use DO/EXCEPTION blocks — idempotent.
--   • New FK constraints use DO/EXCEPTION blocks — idempotent.
--
-- EXECUTION ORDER (dependency-safe)
--   §1  New enum types
--   §2  New enum values on existing types
--   §3  New columns on existing tables  (with backfills where needed)
--   §4  New unique indexes on existing tables
--   §5  New tables, indexes, and foreign keys
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- §1  NEW ENUM TYPES
-- ═════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "DebitCredit" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IncomeTransferStatus" AS ENUM ('ACTIVE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerTransactionType" AS ENUM (
    'DEPOSIT',
    'INVESTMENT',
    'ROI',
    'LEVEL_INCOME',
    'MATCHING_BONUS',
    'ORBIT_INCOME',
    'SALARY_INCOME',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'WITHDRAWAL_REQUEST',
    'WITHDRAWAL_BROADCAST',
    'WITHDRAWAL_COMPLETED',
    'WITHDRAWAL_REFUND',
    'WITHDRAWAL_CANCELLATION',
    'MANUAL_ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LedgerWalletType" AS ENUM (
    'DEPOSIT_WALLET',
    'INCOME_WALLET',
    'WITHDRAWAL_WALLET',
    'LOCKED_BALANCE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DiscrepancySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- §2  NEW VALUES ON EXISTING ENUM TYPES
--     ALTER TYPE ... ADD VALUE IF NOT EXISTS is safe inside a transaction
--     on PostgreSQL 12+ and is a no-op when the value already exists.
-- ═════════════════════════════════════════════════════════════════════════════

-- WithdrawalStatus: 8 new pipeline states (PENDING/APPROVED/COMPLETED/REJECTED/
--   CANCELLED already exist from sprint14)
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'VALIDATING';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'SIGNED';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'BROADCASTING';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'CONFIRMING';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW';

-- DepositStatus: CONFIRMING state for blockchain-verified deposits
ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'CONFIRMING';

-- DepositVerificationStatus: CREDITING transitional state
ALTER TYPE "DepositVerificationStatus" ADD VALUE IF NOT EXISTS 'CREDITING';


-- ═════════════════════════════════════════════════════════════════════════════
-- §3  NEW COLUMNS ON EXISTING TABLES
-- ═════════════════════════════════════════════════════════════════════════════

-- ── users ─────────────────────────────────────────────────────────────────────

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isTestUser" BOOLEAN NOT NULL DEFAULT false;

-- directLeftCount / directRightCount: added nullable first, then backfilled
-- from actual sponsor-tree data, then set NOT NULL.  This ensures existing
-- production users receive accurate counts rather than a blanket 0.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directLeftCount"  INTEGER;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "directRightCount" INTEGER;

-- Backfill: count each user's direct referrals placed on each binary leg.
-- Guard (IS NULL) makes re-runs safe — already-populated rows are skipped.
UPDATE "users" u
SET
  "directLeftCount" = (
    SELECT COUNT(*)
    FROM   referral_history rh
    JOIN   users child ON rh."userId" = child.id
    WHERE  rh."sponsorId" = u.id
    AND    child.position = 'LEFT'
  ),
  "directRightCount" = (
    SELECT COUNT(*)
    FROM   referral_history rh
    JOIN   users child ON rh."userId" = child.id
    WHERE  rh."sponsorId" = u.id
    AND    child.position = 'RIGHT'
  )
WHERE "directLeftCount" IS NULL
   OR "directRightCount" IS NULL;

ALTER TABLE "users" ALTER COLUMN "directLeftCount"  SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "directLeftCount"  SET DEFAULT 0;
ALTER TABLE "users" ALTER COLUMN "directRightCount" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "directRightCount" SET DEFAULT 0;


-- ── wallet_transactions ────────────────────────────────────────────────────────
-- source_deposit_id: nullable reference to the originating deposit (no FK
-- constraint by design — deposit may be deleted after settlement).

ALTER TABLE "wallet_transactions" ADD COLUMN IF NOT EXISTS "source_deposit_id" TEXT;


-- ── referral_history ──────────────────────────────────────────────────────────
-- leg: which side of the upline's binary tree this referral was placed on.
-- Nullable — legacy records without placement data remain NULL.

ALTER TABLE "referral_history" ADD COLUMN IF NOT EXISTS "leg" "BinaryPosition";


-- ── salary_achievement ────────────────────────────────────────────────────────

ALTER TABLE "salary_achievement" ADD COLUMN IF NOT EXISTS "paymentsMade" INTEGER   NOT NULL DEFAULT 0;
ALTER TABLE "salary_achievement" ADD COLUMN IF NOT EXISTS "lastPaidAt"   TIMESTAMP(3);


-- ── binary_match_income ───────────────────────────────────────────────────────

ALTER TABLE "binary_match_income" ADD COLUMN IF NOT EXISTS "carryForwardLeft"  DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "binary_match_income" ADD COLUMN IF NOT EXISTS "carryForwardRight" DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "binary_match_income" ADD COLUMN IF NOT EXISTS "flushedBV"         DECIMAL(18,8) NOT NULL DEFAULT 0;


-- ── binary_orbit_income ───────────────────────────────────────────────────────

ALTER TABLE "binary_orbit_income" ADD COLUMN IF NOT EXISTS "carryForwardLeft"  DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "binary_orbit_income" ADD COLUMN IF NOT EXISTS "carryForwardRight" DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "binary_orbit_income" ADD COLUMN IF NOT EXISTS "flushedBV"         DECIMAL(18,8) NOT NULL DEFAULT 0;


-- ── withdrawal_settings ───────────────────────────────────────────────────────

ALTER TABLE "withdrawal_settings" ADD COLUMN IF NOT EXISTS "feePercentage" DECIMAL(5,4) NOT NULL DEFAULT 0;


-- ── withdrawal_requests ───────────────────────────────────────────────────────
-- 15 new columns added in the order required to satisfy backfill dependencies.
-- fee must exist before netAmount backfill can run.

-- seqId — monotonically increasing display ID.
-- Explicit sequence gives us full control over idempotency and ordering.
CREATE SEQUENCE IF NOT EXISTS "withdrawal_requests_seqId_seq";

ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "seqId" INTEGER;

-- Assign seqId to existing rows in chronological (createdAt) order so the
-- display number PW-WD-000001 maps to the oldest withdrawal, not storage order.
UPDATE "withdrawal_requests" wr
SET    "seqId" = sub.row_num
FROM (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY "createdAt") AS row_num
  FROM   "withdrawal_requests"
  WHERE  "seqId" IS NULL
) sub
WHERE wr.id = sub.id
  AND wr."seqId" IS NULL;

ALTER TABLE "withdrawal_requests" ALTER COLUMN "seqId" SET NOT NULL;
ALTER TABLE "withdrawal_requests" ALTER COLUMN "seqId" SET DEFAULT nextval('"withdrawal_requests_seqId_seq"');

-- Advance the sequence past the highest assigned value so new rows continue
-- from the correct position.
SELECT setval(
  '"withdrawal_requests_seqId_seq"',
  COALESCE((SELECT MAX("seqId") FROM "withdrawal_requests"), 0) + 1,
  false
);

ALTER SEQUENCE "withdrawal_requests_seqId_seq"
  OWNED BY "withdrawal_requests"."seqId";

-- withdrawalId — optional human-readable/external reference (nullable unique).
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "withdrawalId" TEXT;

-- idempotencyKey — guaranteed unique per request; existing rows receive a UUID.
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

UPDATE "withdrawal_requests"
SET    "idempotencyKey" = gen_random_uuid()::TEXT
WHERE  "idempotencyKey" IS NULL;

ALTER TABLE "withdrawal_requests" ALTER COLUMN "idempotencyKey" SET NOT NULL;
ALTER TABLE "withdrawal_requests" ALTER COLUMN "idempotencyKey" SET DEFAULT gen_random_uuid();

-- currency
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USDT';

-- fee — must exist before netAmount backfill.
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "fee" DECIMAL(18,8) NOT NULL DEFAULT 0;

-- netAmount (the only destructive-risk column in the entire migration).
-- Three-step pattern: add nullable → backfill → enforce NOT NULL.
-- Backfill formula: netAmount = amount − fee (fee was 0 for all legacy rows).
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "netAmount" DECIMAL(18,8);

UPDATE "withdrawal_requests"
SET    "netAmount" = "amount" - COALESCE("fee", 0)
WHERE  "netAmount" IS NULL;

ALTER TABLE "withdrawal_requests" ALTER COLUMN "netAmount" SET NOT NULL;

-- failureReason
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

-- preparedTxData
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "preparedTxData" JSONB;

-- requestedAt — backfilled from createdAt to preserve historical accuracy.
-- Legacy rows must NOT receive the migration timestamp.
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3);

UPDATE "withdrawal_requests"
SET    "requestedAt" = "createdAt"
WHERE  "requestedAt" IS NULL;

ALTER TABLE "withdrawal_requests" ALTER COLUMN "requestedAt" SET NOT NULL;
ALTER TABLE "withdrawal_requests" ALTER COLUMN "requestedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Remaining nullable lifecycle timestamps
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "processedAt"       TIMESTAMP(3);
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "signedAt"          TIMESTAMP(3);
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "broadcastAt"       TIMESTAMP(3);
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "confirmationBlock" INTEGER;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "confirmationCount" INTEGER;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "explorerUrl"       TEXT;


-- ═════════════════════════════════════════════════════════════════════════════
-- §4  NEW UNIQUE INDEXES ON EXISTING TABLES
-- ═════════════════════════════════════════════════════════════════════════════

-- withdrawal_requests.withdrawalId — nullable unique; PostgreSQL allows
-- multiple NULLs alongside the unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_requests_withdrawalId_key"
  ON "withdrawal_requests"("withdrawalId");

-- withdrawal_requests.idempotencyKey — NOT NULL unique.
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_requests_idempotencyKey_key"
  ON "withdrawal_requests"("idempotencyKey");

-- wallet_transactions.source_deposit_id — nullable unique.
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_source_deposit_id_key"
  ON "wallet_transactions"("source_deposit_id");


-- ═════════════════════════════════════════════════════════════════════════════
-- §5  NEW TABLES
--     Created in dependency order.  Each table is idempotent (IF NOT EXISTS).
--     FK constraints use DO/EXCEPTION blocks so re-runs skip already-created
--     constraints without error.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── notifications ─────────────────────────────────────────────────────────────
-- Requires: NotificationType (created in migration 20260630125000).

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"        TEXT               NOT NULL,
  "userId"    TEXT               NOT NULL,
  "type"      "NotificationType" NOT NULL,
  "title"     TEXT               NOT NULL,
  "message"   TEXT               NOT NULL,
  "isRead"    BOOLEAN            NOT NULL DEFAULT false,
  "metadata"  JSONB,
  "createdAt" TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_userId_idx"
  ON "notifications"("userId");

CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx"
  ON "notifications"("userId", "isRead");

CREATE INDEX IF NOT EXISTS "notifications_createdAt_idx"
  ON "notifications"("createdAt");

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── income_transfers ──────────────────────────────────────────────────────────
-- Requires: IncomeTransferStatus (created in §1).

CREATE TABLE IF NOT EXISTS "income_transfers" (
  "id"              TEXT                   NOT NULL,
  "userId"          TEXT                   NOT NULL,
  "totalAmount"     DECIMAL(18,8)          NOT NULL,
  "transferFee"     DECIMAL(18,8),
  "netAmount"       DECIMAL(18,8),
  "releasedAmount"  DECIMAL(18,8)          NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(18,8)          NOT NULL,
  "hourlySlice"     DECIMAL(18,8)          NOT NULL,
  "hoursCompleted"  INTEGER                NOT NULL DEFAULT 0,
  "status"          "IncomeTransferStatus" NOT NULL DEFAULT 'ACTIVE',
  "nextReleaseAt"   TIMESTAMP(3)           NOT NULL,
  "createdAt"       TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"     TIMESTAMP(3),

  CONSTRAINT "income_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "income_transfers_userId_idx"
  ON "income_transfers"("userId");

CREATE INDEX IF NOT EXISTS "income_transfers_status_idx"
  ON "income_transfers"("status");

CREATE INDEX IF NOT EXISTS "income_transfers_nextReleaseAt_idx"
  ON "income_transfers"("nextReleaseAt");

DO $$ BEGIN
  ALTER TABLE "income_transfers"
    ADD CONSTRAINT "income_transfers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── income_transfer_releases ──────────────────────────────────────────────────
-- Requires: income_transfers (created above).

CREATE TABLE IF NOT EXISTS "income_transfer_releases" (
  "id"         TEXT          NOT NULL,
  "transferId" TEXT          NOT NULL,
  "hourNumber" INTEGER       NOT NULL,
  "amount"     DECIMAL(18,8) NOT NULL,
  "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "income_transfer_releases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "income_transfer_releases_transferId_idx"
  ON "income_transfer_releases"("transferId");

DO $$ BEGIN
  ALTER TABLE "income_transfer_releases"
    ADD CONSTRAINT "income_transfer_releases_transferId_fkey"
    FOREIGN KEY ("transferId") REFERENCES "income_transfers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── financial_ledger ──────────────────────────────────────────────────────────
-- Immutable append-only ledger.  No FK constraints by design — references are
-- soft (memberId, referenceId) so historical entries survive object deletion.
-- Requires: LedgerTransactionType, LedgerWalletType, DebitCredit (§1).

CREATE TABLE IF NOT EXISTS "financial_ledger" (
  "id"               TEXT                    NOT NULL,
  "referenceId"      TEXT                    NOT NULL,
  "referenceType"    TEXT                    NOT NULL,
  "memberId"         TEXT                    NOT NULL,
  "username"         TEXT                    NOT NULL,
  "transactionType"  "LedgerTransactionType" NOT NULL,
  "amount"           DECIMAL(18,8)           NOT NULL,
  "currency"         TEXT                    NOT NULL DEFAULT 'USDT',
  "debitCredit"      "DebitCredit"           NOT NULL,
  "walletType"       "LedgerWalletType"      NOT NULL,
  "openingBalance"   DECIMAL(18,8)           NOT NULL,
  "closingBalance"   DECIMAL(18,8)           NOT NULL,
  "blockchainTxHash" TEXT,
  "withdrawalId"     TEXT,
  "investmentId"     TEXT,
  "metadata"         JSONB,
  "createdAt"        TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "financial_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_ledger_memberId_idx"
  ON "financial_ledger"("memberId");

CREATE INDEX IF NOT EXISTS "financial_ledger_referenceId_idx"
  ON "financial_ledger"("referenceId");

CREATE INDEX IF NOT EXISTS "financial_ledger_transactionType_idx"
  ON "financial_ledger"("transactionType");

CREATE INDEX IF NOT EXISTS "financial_ledger_createdAt_idx"
  ON "financial_ledger"("createdAt");

CREATE INDEX IF NOT EXISTS "financial_ledger_withdrawalId_idx"
  ON "financial_ledger"("withdrawalId");

CREATE INDEX IF NOT EXISTS "financial_ledger_blockchainTxHash_idx"
  ON "financial_ledger"("blockchainTxHash");


-- ── financial_discrepancies ───────────────────────────────────────────────────
-- Requires: DiscrepancySeverity, DiscrepancyStatus (§1).

CREATE TABLE IF NOT EXISTS "financial_discrepancies" (
  "id"              TEXT                  NOT NULL,
  "type"            TEXT                  NOT NULL,
  "severity"        "DiscrepancySeverity" NOT NULL,
  "description"     TEXT                  NOT NULL,
  "detectedAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"      TIMESTAMP(3),
  "resolvedBy"      TEXT,
  "resolutionNotes" TEXT,
  "status"          "DiscrepancyStatus"   NOT NULL DEFAULT 'OPEN',
  "metadata"        JSONB,
  "createdAt"       TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3)          NOT NULL,

  CONSTRAINT "financial_discrepancies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_discrepancies_status_idx"
  ON "financial_discrepancies"("status");

CREATE INDEX IF NOT EXISTS "financial_discrepancies_severity_idx"
  ON "financial_discrepancies"("severity");

CREATE INDEX IF NOT EXISTS "financial_discrepancies_detectedAt_idx"
  ON "financial_discrepancies"("detectedAt");


-- ── reconciliation_reports ────────────────────────────────────────────────────
-- No enum or FK dependencies.

CREATE TABLE IF NOT EXISTS "reconciliation_reports" (
  "id"               TEXT         NOT NULL,
  "runAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"           TEXT         NOT NULL,
  "summary"          JSONB        NOT NULL,
  "discrepancyCount" INTEGER      NOT NULL DEFAULT 0,
  "isManual"         BOOLEAN      NOT NULL DEFAULT false,
  "triggeredBy"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reconciliation_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reconciliation_reports_runAt_idx"
  ON "reconciliation_reports"("runAt");


-- ── wallet_addresses ──────────────────────────────────────────────────────────
-- Requires: WithdrawalNetwork (exists since sprint14).

CREATE TABLE IF NOT EXISTS "wallet_addresses" (
  "id"         TEXT                NOT NULL,
  "userId"     TEXT                NOT NULL,
  "network"    "WithdrawalNetwork" NOT NULL,
  "address"    TEXT                NOT NULL,
  "label"      TEXT,
  "isVerified" BOOLEAN             NOT NULL DEFAULT true,
  "isPrimary"  BOOLEAN             NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)        NOT NULL,

  CONSTRAINT "wallet_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_addresses_userId_network_address_key"
  ON "wallet_addresses"("userId", "network", "address");

CREATE INDEX IF NOT EXISTS "wallet_addresses_userId_idx"
  ON "wallet_addresses"("userId");

CREATE INDEX IF NOT EXISTS "wallet_addresses_network_idx"
  ON "wallet_addresses"("network");

DO $$ BEGIN
  ALTER TABLE "wallet_addresses"
    ADD CONSTRAINT "wallet_addresses_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── wallet_change_audit_logs ──────────────────────────────────────────────────
-- Intentionally FK-free: denormalized audit log that must persist even if the
-- referenced admin or user is later deleted.

CREATE TABLE IF NOT EXISTS "wallet_change_audit_logs" (
  "id"             TEXT         NOT NULL,
  "adminId"        TEXT         NOT NULL,
  "adminUsername"  TEXT         NOT NULL,
  "userId"         TEXT         NOT NULL,
  "userUsername"   TEXT         NOT NULL,
  "previousWallet" TEXT,
  "newWallet"      TEXT         NOT NULL,
  "reason"         TEXT         NOT NULL,
  "ipAddress"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "wallet_change_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wallet_change_audit_logs_userId_idx"
  ON "wallet_change_audit_logs"("userId");

CREATE INDEX IF NOT EXISTS "wallet_change_audit_logs_adminId_idx"
  ON "wallet_change_audit_logs"("adminId");

CREATE INDEX IF NOT EXISTS "wallet_change_audit_logs_createdAt_idx"
  ON "wallet_change_audit_logs"("createdAt");


-- ── withdrawal_events ─────────────────────────────────────────────────────────
-- Append-only timeline for each withdrawal.
-- Requires: withdrawal_requests (already exists since sprint14).

CREATE TABLE IF NOT EXISTS "withdrawal_events" (
  "id"           TEXT         NOT NULL,
  "withdrawalId" TEXT         NOT NULL,
  "eventType"    TEXT         NOT NULL,
  "details"      JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "withdrawal_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "withdrawal_events_withdrawalId_idx"
  ON "withdrawal_events"("withdrawalId");

CREATE INDEX IF NOT EXISTS "withdrawal_events_createdAt_idx"
  ON "withdrawal_events"("createdAt");

DO $$ BEGIN
  ALTER TABLE "withdrawal_events"
    ADD CONSTRAINT "withdrawal_events_withdrawalId_fkey"
    FOREIGN KEY ("withdrawalId") REFERENCES "withdrawal_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION
-- After deploying, verify row counts match the pre-migration snapshot:
--
--   SELECT 'users',                COUNT(*) FROM users
--   UNION ALL SELECT 'investments',           COUNT(*) FROM investments
--   UNION ALL SELECT 'deposit_requests',      COUNT(*) FROM deposit_requests
--   UNION ALL SELECT 'withdrawal_requests',   COUNT(*) FROM withdrawal_requests
--   UNION ALL SELECT 'wallet_transactions',   COUNT(*) FROM wallet_transactions
--   UNION ALL SELECT 'roi_ledger',            COUNT(*) FROM roi_ledger
--   UNION ALL SELECT 'level_income',          COUNT(*) FROM level_income
--   UNION ALL SELECT 'binary_match_income',   COUNT(*) FROM binary_match_income
--   UNION ALL SELECT 'salary_income',         COUNT(*) FROM salary_income
--   UNION ALL SELECT 'admin_logs',            COUNT(*) FROM admin_logs;
-- ─────────────────────────────────────────────────────────────────────────────
