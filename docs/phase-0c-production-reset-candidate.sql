-- PRIMEWAVE V1 PHASE 0C — REVIEW-ONLY CANDIDATE
-- NOT APPROVED FOR EXECUTION. This file was not run.
-- Default approval is NO; the final statement is ROLLBACK.
-- Do not change either safety gate without separate explicit approval.
-- Requires psql. All production writers must already be stopped and verified.
-- Snapshot counts below are from the earlier read-only inspection. Do not refresh
-- them until a separate final read-only preflight is explicitly approved.

\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';
SET LOCAL app.phase0c_reset_approved = 'NO';

DO $approval_gate$
BEGIN
  IF current_setting('app.phase0c_reset_approved', true) IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'Phase 0C reset is not approved; no reset statements may run';
  END IF;
END
$approval_gate$;

-- Lock the exact Production table set observed during read-only inspection.
-- This is not a substitute for stopping every Autoscale/API/worker process.
LOCK TABLE
  public._prisma_migrations,
  public.admin_logs,
  public.admins,
  public.binary_match_income,
  public.binary_orbit_income,
  public.bulk_password_reset_runs,
  public.bv_history,
  public.common_temporary_password_reset_runs,
  public.company_wallets,
  public.deposit_requests,
  public.deposit_verifications,
  public.financial_discrepancies,
  public.financial_ledger,
  public.impersonation_sessions,
  public.income_transfer_releases,
  public.income_transfers,
  public.investments,
  public.job_execution_logs,
  public.level_income,
  public.manual_deposit_idempotency,
  public.match_bv_ledger,
  public.notifications,
  public.orbit_bv_ledger,
  public.password_reset_tokens,
  public.power_bv_ledger,
  public.reconciliation_reports,
  public.referral_history,
  public.roi_ledger,
  public.salary_achievement,
  public.salary_business_event,
  public.salary_business_summary,
  public.salary_bv_ledger,
  public.salary_income,
  public.salary_payout_event,
  public.salary_rank_config,
  public.salary_run,
  public.salary_run_audit,
  public.system_settings,
  public.users,
  public.wallet_addresses,
  public.wallet_change_audit_logs,
  public.wallet_transactions,
  public.wallets,
  public.withdrawal_events,
  public.withdrawal_requests,
  public.withdrawal_settings
IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE phase0c_master_ids ON COMMIT DROP AS
SELECT id
FROM public.users
WHERE lower(username) = 'master';

CREATE TEMP TABLE phase0c_member_ids ON COMMIT DROP AS
SELECT id
FROM public.users
WHERE lower(username) <> 'master';

-- Populate only from a separately approved final preflight and verified
-- out-of-database evidence manifest. Do not update any original database status.
CREATE TEMP TABLE phase0c_settlement_manifest (
  record_type text NOT NULL CHECK (record_type IN ('withdrawal', 'income_transfer')),
  record_id text NOT NULL,
  database_status text NOT NULL,
  database_amount numeric NOT NULL,
  database_fee numeric,
  database_net_amount numeric,
  database_currency text,
  external_settlement_status text NOT NULL
    CHECK (external_settlement_status = 'SETTLED_EXTERNALLY'),
  external_amount numeric NOT NULL,
  external_currency text NOT NULL,
  external_reference text NOT NULL CHECK (length(trim(external_reference)) > 0),
  evidence_sha256 text NOT NULL
    CHECK (evidence_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  settled_at timestamptz NOT NULL,
  prepared_by text NOT NULL,
  independently_verified_by text NOT NULL,
  PRIMARY KEY (record_type, record_id),
  CHECK (prepared_by <> independently_verified_by)
) ON COMMIT DROP;

-- These snapshots remain private to this transaction and are never selected
-- into output. The Master/admin password hashes are compared internally only.
CREATE TEMP TABLE phase0c_master_identity_snapshot ON COMMIT DROP AS
SELECT
  id, email, phone, username, "passwordHash", "passwordResetRequired",
  "authVersion", "passwordChangedAt", "fullReplacementPasswordResetRunId",
  "firstName", "lastName", "referralCode", "referredBy", "walletAddress",
  "telegramId", "profileImage", "createdAt", "isTestUser", status,
  "withdrawalHold", "withdrawalHoldReason", "withdrawalHoldBy", "withdrawalHoldAt"
FROM public.users
WHERE id IN (SELECT id FROM phase0c_master_ids);

CREATE TEMP TABLE phase0c_admins_snapshot ON COMMIT DROP AS
SELECT * FROM public.admins;
CREATE TEMP TABLE phase0c_system_settings_snapshot ON COMMIT DROP AS
SELECT * FROM public.system_settings;
CREATE TEMP TABLE phase0c_salary_rank_config_snapshot ON COMMIT DROP AS
SELECT * FROM public.salary_rank_config;
CREATE TEMP TABLE phase0c_withdrawal_settings_snapshot ON COMMIT DROP AS
SELECT * FROM public.withdrawal_settings;
CREATE TEMP TABLE phase0c_company_wallets_snapshot ON COMMIT DROP AS
SELECT * FROM public.company_wallets;
CREATE TEMP TABLE phase0c_prisma_migrations_snapshot ON COMMIT DROP AS
SELECT * FROM public._prisma_migrations;
CREATE TEMP TABLE phase0c_bulk_reset_runs_snapshot ON COMMIT DROP AS
SELECT * FROM public.bulk_password_reset_runs;
CREATE TEMP TABLE phase0c_common_reset_runs_snapshot ON COMMIT DROP AS
SELECT * FROM public.common_temporary_password_reset_runs;
CREATE TEMP TABLE phase0c_financial_discrepancies_snapshot ON COMMIT DROP AS
SELECT * FROM public.financial_discrepancies;
CREATE TEMP TABLE phase0c_reconciliation_reports_snapshot ON COMMIT DROP AS
SELECT * FROM public.reconciliation_reports;
CREATE TEMP TABLE phase0c_wallet_change_audit_snapshot ON COMMIT DROP AS
SELECT * FROM public.wallet_change_audit_logs;
CREATE TEMP TABLE phase0c_job_logs_snapshot ON COMMIT DROP AS
SELECT * FROM public.job_execution_logs;
CREATE TEMP TABLE phase0c_salary_runs_snapshot ON COMMIT DROP AS
SELECT * FROM public.salary_run;
CREATE TEMP TABLE phase0c_salary_run_audit_snapshot ON COMMIT DROP AS
SELECT * FROM public.salary_run_audit;

-- A deleted ordinary-user target is expected to become NULL due to the
-- existing admin_logs.targetUserId ON DELETE SET NULL constraint. Everything
-- else in each audit row, including details JSON, must remain identical.
CREATE TEMP TABLE phase0c_admin_logs_snapshot ON COMMIT DROP AS
SELECT
  id,
  "adminId",
  action,
  CASE
    WHEN "targetUserId" IN (SELECT id FROM phase0c_member_ids) THEN NULL
    ELSE "targetUserId"
  END AS "targetUserId",
  details,
  "createdAt"
FROM public.admin_logs;

CREATE TEMP TABLE phase0c_preserved_counts ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.admins) AS admins,
  (SELECT count(*) FROM public.admin_logs) AS admin_logs,
  (SELECT count(*) FROM public.bulk_password_reset_runs) AS bulk_reset_runs,
  (SELECT count(*) FROM public.common_temporary_password_reset_runs) AS common_reset_runs,
  (SELECT count(*) FROM public.system_settings) AS system_settings,
  (SELECT count(*) FROM public.salary_rank_config) AS salary_rank_config,
  (SELECT count(*) FROM public.withdrawal_settings) AS withdrawal_settings,
  (SELECT count(*) FROM public.company_wallets) AS company_wallets,
  (SELECT count(*) FROM public._prisma_migrations) AS prisma_migrations,
  (SELECT count(*) FROM public.financial_discrepancies) AS financial_discrepancies,
  (SELECT count(*) FROM public.reconciliation_reports) AS reconciliation_reports,
  (SELECT count(*) FROM public.wallet_change_audit_logs) AS wallet_change_audit_logs,
  (SELECT count(*) FROM public.job_execution_logs) AS job_execution_logs,
  (SELECT count(*) FROM public.salary_run) AS salary_runs,
  (SELECT count(*) FROM public.salary_run_audit) AS salary_run_audits;

DO $preflight$
DECLARE
  master_wallet_count integer;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Unexpected database; stop and re-check the Production target';
  END IF;
  IF (SELECT count(*) FROM phase0c_master_ids) <> 1
     OR (SELECT count(*) FROM phase0c_member_ids) <> 6688
     OR (SELECT count(*) FROM public.users) <> 6689 THEN
    RAISE EXCEPTION 'User snapshot changed or Master identity is ambiguous';
  END IF;
  IF (SELECT count(*) FROM public.admins) <> 4 THEN
    RAISE EXCEPTION 'Admin snapshot changed; refusing to continue';
  END IF;
  SELECT count(*) INTO master_wallet_count
  FROM public.wallets w
  JOIN phase0c_master_ids m ON w."userId" = m.id;
  IF master_wallet_count <> 1 OR (SELECT count(*) FROM public.wallets) <> 6689 THEN
    RAISE EXCEPTION 'Master wallet or wallet snapshot is unexpected';
  END IF;
  IF (SELECT count(*) FROM public.investments) <> 211
     OR (SELECT count(*) FROM public.roi_ledger) <> 32415
     OR (SELECT count(*) FROM public.deposit_requests) <> 222
     OR (SELECT count(*) FROM public.withdrawal_requests) <> 157
     OR (SELECT count(*) FROM public.wallet_transactions) <> 10076
     OR (SELECT count(*) FROM public.financial_ledger) <> 625
     OR (SELECT count(*) FROM public.admin_logs) <> 1199
     OR (SELECT count(*) FROM public.system_settings) <> 48
     OR (SELECT count(*) FROM public._prisma_migrations) <> 40 THEN
    RAISE EXCEPTION 'Read-only Production snapshot changed; regenerate and review this draft';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests
    WHERE status NOT IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Outstanding/manual-review withdrawals must be reconciled first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.income_transfers WHERE "remainingAmount" > 0) THEN
    RAISE EXCEPTION 'Transfers with unreleased amounts must be reconciled first';
  END IF;
  IF to_regclass('public.single_plan_accounts') IS NOT NULL
     OR to_regclass('public.single_plan_events') IS NOT NULL
     OR to_regclass('public.single_plan_cycles') IS NOT NULL THEN
    RAISE EXCEPTION 'Production schema changed; re-inventory before any reset';
  END IF;
END
$preflight$;

-- Delete restrictive dependents first. No TRUNCATE or CASCADE is used.
DELETE FROM public.wallet_transactions;
DELETE FROM public.withdrawal_events;
DELETE FROM public.deposit_verifications;
DELETE FROM public.income_transfer_releases;
DELETE FROM public.salary_payout_event;

DELETE FROM public.withdrawal_requests;
DELETE FROM public.deposit_requests;
DELETE FROM public.income_transfers;
DELETE FROM public.salary_income;

DELETE FROM public.password_reset_tokens
WHERE "userId" IN (SELECT id FROM phase0c_member_ids);
DELETE FROM public.impersonation_sessions
WHERE "targetUserId" IN (SELECT id FROM phase0c_member_ids);
DELETE FROM public.notifications
WHERE "userId" IN (SELECT id FROM phase0c_member_ids);
DELETE FROM public.wallet_addresses
WHERE "userId" IN (SELECT id FROM phase0c_member_ids);

DELETE FROM public.manual_deposit_idempotency;
DELETE FROM public.financial_ledger;
DELETE FROM public.referral_history;
DELETE FROM public.level_income;
DELETE FROM public.match_bv_ledger;
DELETE FROM public.orbit_bv_ledger;
DELETE FROM public.salary_bv_ledger;
DELETE FROM public.bv_history;
DELETE FROM public.roi_ledger;
DELETE FROM public.binary_match_income;
DELETE FROM public.binary_orbit_income;
DELETE FROM public.power_bv_ledger;
DELETE FROM public.salary_achievement;
DELETE FROM public.salary_business_event;
DELETE FROM public.salary_business_summary
WHERE "userId" IN (SELECT id FROM phase0c_member_ids);

DELETE FROM public.investments;
DELETE FROM public.wallets
WHERE "userId" IN (SELECT id FROM phase0c_member_ids);

-- The two User self-FKs are NO ACTION, so detach the old tree before deletion.
UPDATE public.users
SET "sponsorId" = NULL,
    "binaryParentId" = NULL
WHERE true;

DELETE FROM public.users
WHERE id IN (SELECT id FROM phase0c_member_ids);

-- Keep the Master identity/credential fields. Reset only network/stat fields.
UPDATE public.users
SET "directReferralCount" = 0,
    "directLeftCount" = 0,
    "directRightCount" = 0,
    "position" = NULL,
    "leftDeepestNodeId" = NULL,
    "rightDeepestNodeId" = NULL,
    "leftBV" = 0,
    "rightBV" = 0,
    "powerLeftBV" = 0,
    "powerRightBV" = 0,
    "matchingLeftBV" = 0,
    "matchingRightBV" = 0,
    "orbitLeftBV" = 0,
    "orbitRightBV" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM phase0c_master_ids);

UPDATE public.wallets
SET "depositWallet" = 0,
    "incomeWallet" = 0,
    "withdrawalWallet" = 0,
    "lockedWithdrawalBalance" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IN (SELECT id FROM phase0c_master_ids);

UPDATE public.salary_business_summary
SET "directBusiness" = 0,
    "downlineBusiness" = 0,
    "powerBusiness" = 0,
    "lastReconciledAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" IN (SELECT id FROM phase0c_master_ids);

-- Assertions execute before any possible commit.
DO $verify$
DECLARE
  p record;
  fk record;
  orphan_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.users) <> 1
     OR (SELECT count(*) FROM phase0c_master_ids) <> 1
     OR (SELECT count(*) FROM public.admins) <> 4
     OR (SELECT count(*) FROM public.wallets) <> 1 THEN
    RAISE EXCEPTION 'Protected account or wallet counts do not match expected state';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wallets w
    JOIN phase0c_master_ids m ON w."userId" = m.id
    WHERE w."depositWallet" <> 0 OR w."incomeWallet" <> 0
       OR w."withdrawalWallet" <> 0 OR w."lockedWithdrawalBalance" <> 0
  ) THEN
    RAISE EXCEPTION 'Master wallet is not zero';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE "directReferralCount" <> 0 OR "directLeftCount" <> 0 OR "directRightCount" <> 0
       OR "leftBV" <> 0 OR "rightBV" <> 0 OR "powerLeftBV" <> 0 OR "powerRightBV" <> 0
       OR "matchingLeftBV" <> 0 OR "matchingRightBV" <> 0
       OR "orbitLeftBV" <> 0 OR "orbitRightBV" <> 0
       OR "sponsorId" IS NOT NULL OR "binaryParentId" IS NOT NULL
       OR "leftDeepestNodeId" IS NOT NULL OR "rightDeepestNodeId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Master network values are not zero';
  END IF;
  IF (SELECT count(*) FROM public.investments) <> 0
     OR (SELECT count(*) FROM public.roi_ledger) <> 0
     OR (SELECT count(*) FROM public.wallet_transactions) <> 0
     OR (SELECT count(*) FROM public.financial_ledger) <> 0
     OR (SELECT count(*) FROM public.deposit_requests) <> 0
     OR (SELECT count(*) FROM public.deposit_verifications) <> 0
     OR (SELECT count(*) FROM public.withdrawal_requests) <> 0
     OR (SELECT count(*) FROM public.withdrawal_events) <> 0
     OR (SELECT count(*) FROM public.income_transfers) <> 0
     OR (SELECT count(*) FROM public.income_transfer_releases) <> 0
     OR (SELECT count(*) FROM public.referral_history) <> 0
     OR (SELECT count(*) FROM public.level_income) <> 0
     OR (SELECT count(*) FROM public.match_bv_ledger) <> 0
     OR (SELECT count(*) FROM public.orbit_bv_ledger) <> 0
     OR (SELECT count(*) FROM public.salary_bv_ledger) <> 0
     OR (SELECT count(*) FROM public.bv_history) <> 0
     OR (SELECT count(*) FROM public.binary_match_income) <> 0
     OR (SELECT count(*) FROM public.binary_orbit_income) <> 0
     OR (SELECT count(*) FROM public.power_bv_ledger) <> 0
     OR (SELECT count(*) FROM public.salary_achievement) <> 0
     OR (SELECT count(*) FROM public.salary_business_event) <> 0
     OR (SELECT count(*) FROM public.salary_payout_event) <> 0
     OR (SELECT count(*) FROM public.salary_income) <> 0
     OR (SELECT count(*) FROM public.manual_deposit_idempotency) <> 0
     OR EXISTS (
       SELECT 1 FROM public.password_reset_tokens
       WHERE "userId" NOT IN (SELECT id FROM phase0c_master_ids)
     )
     OR EXISTS (
       SELECT 1 FROM public.impersonation_sessions
       WHERE "targetUserId" NOT IN (SELECT id FROM phase0c_master_ids)
     )
     OR EXISTS (
       SELECT 1 FROM public.notifications
       WHERE "userId" NOT IN (SELECT id FROM phase0c_master_ids)
     )
     OR EXISTS (
       SELECT 1 FROM public.wallet_addresses
       WHERE "userId" NOT IN (SELECT id FROM phase0c_master_ids)
     )
     OR EXISTS (
       SELECT 1 FROM public.salary_business_summary
       WHERE "userId" NOT IN (SELECT id FROM phase0c_master_ids)
     ) THEN
    RAISE EXCEPTION 'One or more member financial/operational tables are not empty';
  END IF;

  SELECT * INTO p FROM phase0c_preserved_counts;
  IF (SELECT count(*) FROM public.admins) <> p.admins
     OR (SELECT count(*) FROM public.admin_logs) <> p.admin_logs
     OR (SELECT count(*) FROM public.bulk_password_reset_runs) <> p.bulk_reset_runs
     OR (SELECT count(*) FROM public.common_temporary_password_reset_runs) <> p.common_reset_runs
     OR (SELECT count(*) FROM public.system_settings) <> p.system_settings
     OR (SELECT count(*) FROM public.salary_rank_config) <> p.salary_rank_config
     OR (SELECT count(*) FROM public.withdrawal_settings) <> p.withdrawal_settings
     OR (SELECT count(*) FROM public.company_wallets) <> p.company_wallets
     OR (SELECT count(*) FROM public._prisma_migrations) <> p.prisma_migrations
     OR (SELECT count(*) FROM public.financial_discrepancies) <> p.financial_discrepancies
     OR (SELECT count(*) FROM public.reconciliation_reports) <> p.reconciliation_reports
     OR (SELECT count(*) FROM public.wallet_change_audit_logs) <> p.wallet_change_audit_logs
     OR (SELECT count(*) FROM public.job_execution_logs) <> p.job_execution_logs
     OR (SELECT count(*) FROM public.salary_run) <> p.salary_runs
     OR (SELECT count(*) FROM public.salary_run_audit) <> p.salary_run_audits THEN
    RAISE EXCEPTION 'A protected table row count changed';
  END IF;

  -- Current Production FKs are single-column. Stop if schema drift adds composite FKs.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND cardinality(conkey) <> 1
  ) THEN
    RAISE EXCEPTION 'Composite foreign key found; re-inventory before proceeding';
  END IF;
  FOR fk IN
    SELECT tc.table_schema AS child_schema,
           tc.table_name AS child_table,
           kcu.column_name AS child_column,
           ccu.table_schema AS parent_schema,
           ccu.table_name AS parent_table,
           ccu.column_name AS parent_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema
     AND ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.ordinal_position
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I c LEFT JOIN %I.%I p ON c.%I = p.%I WHERE c.%I IS NOT NULL AND p.%I IS NULL',
      fk.child_schema, fk.child_table, fk.parent_schema, fk.parent_table,
      fk.child_column, fk.parent_column, fk.child_column, fk.parent_column
    ) INTO orphan_count;
    IF orphan_count <> 0 THEN
      RAISE EXCEPTION 'Foreign-key orphans found in %.% column %',
        fk.child_schema, fk.child_table, fk.child_column;
    END IF;
  END LOOP;
END
$verify$;

-- Review-only ending. A later, separately approved execution would require
-- explicit changes to both the approval gate and transaction ending.
ROLLBACK;
