-- PRIMEWAVE V1 PHASE 0C — REVIEW-ONLY CANDIDATE
-- NOT APPROVED FOR EXECUTION. This file was not run.
-- Default approval is NO; the final statement is ROLLBACK.
-- Do not change either safety gate without separate explicit approval.
-- Requires psql. All production writers must already be stopped and verified.
-- Immutable audit/event rows are retained. The preflight aborts when their
-- foreign keys conflict with member deletion; never remove those guard checks.
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
  CHECK (external_amount > 0),
  CHECK (length(trim(external_currency)) > 0),
  prepared_by text NOT NULL CHECK (length(trim(prepared_by)) > 0),
  independently_verified_by text NOT NULL
    CHECK (length(trim(independently_verified_by)) > 0),
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

CREATE TEMP TABLE phase0c_master_wallet_identity_snapshot ON COMMIT DROP AS
SELECT w.id, w."userId", w."createdAt"
FROM public.wallets w
WHERE w."userId" IN (SELECT id FROM phase0c_master_ids);
CREATE TEMP TABLE phase0c_master_salary_summary_identity_snapshot ON COMMIT DROP AS
SELECT s.id, s."userId", s."createdAt"
FROM public.salary_business_summary s
WHERE s."userId" IN (SELECT id FROM phase0c_master_ids);
CREATE TEMP TABLE phase0c_master_wallet_addresses_snapshot ON COMMIT DROP AS
SELECT * FROM public.wallet_addresses
WHERE "userId" IN (SELECT id FROM phase0c_master_ids);

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
CREATE TEMP TABLE phase0c_financial_ledger_snapshot ON COMMIT DROP AS
SELECT * FROM public.financial_ledger;
CREATE TEMP TABLE phase0c_bv_history_snapshot ON COMMIT DROP AS
SELECT * FROM public.bv_history;
CREATE TEMP TABLE phase0c_salary_bv_ledger_snapshot ON COMMIT DROP AS
SELECT * FROM public.salary_bv_ledger;
CREATE TEMP TABLE phase0c_power_bv_ledger_snapshot ON COMMIT DROP AS
SELECT * FROM public.power_bv_ledger;
CREATE TEMP TABLE phase0c_salary_business_event_snapshot ON COMMIT DROP AS
SELECT * FROM public.salary_business_event;
CREATE TEMP TABLE phase0c_salary_payout_event_snapshot ON COMMIT DROP AS
SELECT * FROM public.salary_payout_event;
CREATE TEMP TABLE phase0c_deposit_verifications_snapshot ON COMMIT DROP AS
SELECT * FROM public.deposit_verifications;
CREATE TEMP TABLE phase0c_withdrawal_events_snapshot ON COMMIT DROP AS
SELECT * FROM public.withdrawal_events;
CREATE TEMP TABLE phase0c_income_transfer_releases_snapshot ON COMMIT DROP AS
SELECT * FROM public.income_transfer_releases;
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
  (SELECT count(*) FROM public.financial_ledger) AS financial_ledger,
  (SELECT count(*) FROM public.bv_history) AS bv_history,
  (SELECT count(*) FROM public.salary_bv_ledger) AS salary_bv_ledger,
  (SELECT count(*) FROM public.power_bv_ledger) AS power_bv_ledger,
  (SELECT count(*) FROM public.salary_business_event) AS salary_business_events,
  (SELECT count(*) FROM public.salary_payout_event) AS salary_payout_events,
  (SELECT count(*) FROM public.deposit_verifications) AS deposit_verifications,
  (SELECT count(*) FROM public.withdrawal_events) AS withdrawal_events,
  (SELECT count(*) FROM public.income_transfer_releases) AS income_transfer_releases,
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
  -- Preserve append-only audit/event histories. If a row is present in any
  -- dependent immutable table, the reset must stop rather than delete it or
  -- let a parent DELETE cascade through it.
  IF EXISTS (SELECT 1 FROM public.bv_history)
     OR EXISTS (SELECT 1 FROM public.salary_bv_ledger)
     OR EXISTS (SELECT 1 FROM public.power_bv_ledger)
     OR EXISTS (SELECT 1 FROM public.salary_business_event)
     OR EXISTS (SELECT 1 FROM public.salary_payout_event)
     OR EXISTS (SELECT 1 FROM public.deposit_verifications)
     OR EXISTS (SELECT 1 FROM public.withdrawal_events)
     OR EXISTS (SELECT 1 FROM public.income_transfer_releases) THEN
    RAISE EXCEPTION 'Reset blocked: immutable audit/event rows exist; do not delete them';
  END IF;
  -- Keep both obligation guards. Every historical nonterminal request and
  -- positive transfer remainder must match independent external evidence.
  IF (SELECT count(*) FROM phase0c_settlement_manifest
      WHERE record_type = 'withdrawal')
     <> (SELECT count(*) FROM public.withdrawal_requests
         WHERE status NOT IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')) THEN
    RAISE EXCEPTION 'Settlement manifest must cover every nonterminal withdrawal exactly once';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.withdrawal_requests w
    LEFT JOIN phase0c_settlement_manifest e
      ON e.record_type = 'withdrawal' AND e.record_id = w.id
    WHERE w.status NOT IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')
      AND e.record_id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM phase0c_settlement_manifest e
    LEFT JOIN public.withdrawal_requests w ON w.id = e.record_id
    WHERE e.record_type = 'withdrawal'
      AND (w.id IS NULL
        OR w.status::text IS DISTINCT FROM e.database_status
        OR w.status IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')
        OR w.amount IS DISTINCT FROM e.database_amount
        OR w.fee IS DISTINCT FROM e.database_fee
        OR w."netAmount" IS DISTINCT FROM e.database_net_amount
        OR w.currency::text IS DISTINCT FROM e.database_currency
        OR e.external_currency IS DISTINCT FROM w.currency::text
        OR e.settled_at > CURRENT_TIMESTAMP
        OR e.external_amount IS DISTINCT FROM w."netAmount")
  ) THEN
    RAISE EXCEPTION 'Withdrawal settlement evidence does not match the historical database row';
  END IF;
  IF (SELECT count(*) FROM phase0c_settlement_manifest
      WHERE record_type = 'income_transfer')
     <> (SELECT count(*) FROM public.income_transfers WHERE "remainingAmount" > 0) THEN
    RAISE EXCEPTION 'Settlement manifest must cover every positive transfer remainder exactly once';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.income_transfers t
    LEFT JOIN phase0c_settlement_manifest e
      ON e.record_type = 'income_transfer' AND e.record_id = t.id
    WHERE t."remainingAmount" > 0 AND e.record_id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM phase0c_settlement_manifest e
    LEFT JOIN public.income_transfers t ON t.id = e.record_id
    WHERE e.record_type = 'income_transfer'
      AND (t.id IS NULL
        OR e.database_status IS DISTINCT FROM 'REMAINING_AMOUNT'
        OR e.database_amount IS DISTINCT FROM t."remainingAmount"
        OR e.database_fee IS NOT NULL
        OR e.database_net_amount IS NOT NULL
        OR e.database_currency IS NOT NULL
        OR e.settled_at > CURRENT_TIMESTAMP
        OR e.external_amount IS DISTINCT FROM t."remainingAmount")
  ) THEN
    RAISE EXCEPTION 'Transfer settlement evidence does not match the historical remaining amount';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_trigger trg
    JOIN pg_class rel ON rel.oid = trg.tgrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND NOT trg.tgisinternal
      AND rel.relname IN (
        'admin_logs',
        'users', 'wallets', 'wallet_transactions', 'investments', 'roi_ledger',
        'referral_history', 'binary_match_income', 'binary_orbit_income',
        'level_income', 'match_bv_ledger', 'orbit_bv_ledger', 'salary_bv_ledger',
        'bv_history', 'power_bv_ledger', 'salary_achievement',
        'salary_business_event', 'salary_business_summary', 'salary_income',
        'salary_payout_event', 'deposit_requests', 'deposit_verifications',
        'withdrawal_requests', 'withdrawal_events', 'income_transfers',
        'income_transfer_releases', 'password_reset_tokens',
        'impersonation_sessions', 'notifications', 'wallet_addresses',
        'financial_ledger', 'manual_deposit_idempotency'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected user-defined trigger on a reset target; re-review side effects';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.contype = 'f'
      AND child_ns.nspname = 'public'
      AND parent_ns.nspname = 'public'
      AND parent.relname IN (
        'users', 'investments', 'wallets', 'withdrawal_requests',
        'deposit_requests', 'income_transfers', 'salary_income',
        'salary_business_summary'
      )
      AND child.relname NOT IN (
        'admin_logs', 'binary_match_income', 'binary_orbit_income', 'bv_history',
        'deposit_requests', 'deposit_verifications', 'impersonation_sessions',
        'income_transfer_releases', 'investments', 'level_income',
        'match_bv_ledger', 'notifications', 'orbit_bv_ledger',
        'password_reset_tokens', 'power_bv_ledger', 'referral_history',
        'roi_ledger', 'salary_achievement', 'salary_business_event',
        'salary_business_summary', 'salary_bv_ledger', 'salary_income',
        'salary_payout_event', 'users', 'wallet_addresses',
        'wallet_transactions', 'wallets', 'withdrawal_events',
        'withdrawal_requests'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected foreign-key child of a reset target; re-inventory dependencies';
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
DELETE FROM public.referral_history;
DELETE FROM public.level_income;
DELETE FROM public.match_bv_ledger;
DELETE FROM public.orbit_bv_ledger;
DELETE FROM public.roi_ledger;
DELETE FROM public.binary_match_income;
DELETE FROM public.binary_orbit_income;
DELETE FROM public.salary_achievement;
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
  protected_table record;
  orphan_count bigint;
  difference_count bigint;
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
  IF EXISTS (
    SELECT 1
    FROM phase0c_master_identity_snapshot m
    LEFT JOIN public.users u ON u.id = m.id
    WHERE u.id IS NULL
       OR ROW(
         u.email, u.phone, u.username, u."passwordHash",
         u."passwordResetRequired", u."authVersion", u."passwordChangedAt",
         u."fullReplacementPasswordResetRunId", u."firstName", u."lastName",
         u."referralCode", u."referredBy", u."walletAddress", u."telegramId",
         u."profileImage", u."createdAt", u."isTestUser", u.status,
         u."withdrawalHold", u."withdrawalHoldReason", u."withdrawalHoldBy",
         u."withdrawalHoldAt"
       ) IS DISTINCT FROM ROW(
         m.email, m.phone, m.username, m."passwordHash",
         m."passwordResetRequired", m."authVersion", m."passwordChangedAt",
         m."fullReplacementPasswordResetRunId", m."firstName", m."lastName",
         m."referralCode", m."referredBy", m."walletAddress", m."telegramId",
         m."profileImage", m."createdAt", m."isTestUser", m.status,
         m."withdrawalHold", m."withdrawalHoldReason", m."withdrawalHoldBy",
         m."withdrawalHoldAt"
       )
  ) THEN
    RAISE EXCEPTION 'Protected Master identity or credential fields changed';
  END IF;
  IF EXISTS (
    SELECT id, "userId", "createdAt"
    FROM phase0c_master_wallet_identity_snapshot
    EXCEPT
    SELECT id, "userId", "createdAt"
    FROM public.wallets
    WHERE "userId" IN (SELECT id FROM phase0c_master_ids)
  ) OR EXISTS (
    SELECT id, "userId", "createdAt"
    FROM public.wallets
    WHERE "userId" IN (SELECT id FROM phase0c_master_ids)
    EXCEPT
    SELECT id, "userId", "createdAt"
    FROM phase0c_master_wallet_identity_snapshot
  ) THEN
    RAISE EXCEPTION 'Master wallet identity changed';
  END IF;
  IF EXISTS (
    SELECT id, "userId", "createdAt"
    FROM phase0c_master_salary_summary_identity_snapshot
    EXCEPT
    SELECT id, "userId", "createdAt"
    FROM public.salary_business_summary
    WHERE "userId" IN (SELECT id FROM phase0c_master_ids)
  ) OR EXISTS (
    SELECT id, "userId", "createdAt"
    FROM public.salary_business_summary
    WHERE "userId" IN (SELECT id FROM phase0c_master_ids)
    EXCEPT
    SELECT id, "userId", "createdAt"
    FROM phase0c_master_salary_summary_identity_snapshot
  ) THEN
    RAISE EXCEPTION 'Master salary summary identity changed';
  END IF;
  IF EXISTS (
    SELECT * FROM phase0c_master_wallet_addresses_snapshot
    EXCEPT
    SELECT * FROM public.wallet_addresses
    WHERE "userId" IN (SELECT id FROM phase0c_master_ids)
  ) OR EXISTS (
    SELECT * FROM public.wallet_addresses
    WHERE "userId" IN (SELECT id FROM phase0c_master_ids)
    EXCEPT
    SELECT * FROM phase0c_master_wallet_addresses_snapshot
  ) THEN
    RAISE EXCEPTION 'Master wallet-address records changed';
  END IF;
  IF (SELECT count(*) FROM public.investments) <> 0
     OR (SELECT count(*) FROM public.roi_ledger) <> 0
     OR (SELECT count(*) FROM public.wallet_transactions) <> 0
     OR (SELECT count(*) FROM public.deposit_requests) <> 0
     OR (SELECT count(*) FROM public.withdrawal_requests) <> 0
     OR (SELECT count(*) FROM public.income_transfers) <> 0
     OR (SELECT count(*) FROM public.referral_history) <> 0
     OR (SELECT count(*) FROM public.level_income) <> 0
     OR (SELECT count(*) FROM public.match_bv_ledger) <> 0
     OR (SELECT count(*) FROM public.orbit_bv_ledger) <> 0
     OR (SELECT count(*) FROM public.binary_match_income) <> 0
     OR (SELECT count(*) FROM public.binary_orbit_income) <> 0
     OR (SELECT count(*) FROM public.salary_achievement) <> 0
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
     OR (SELECT count(*) FROM public.financial_ledger) <> p.financial_ledger
     OR (SELECT count(*) FROM public.bv_history) <> p.bv_history
     OR (SELECT count(*) FROM public.salary_bv_ledger) <> p.salary_bv_ledger
     OR (SELECT count(*) FROM public.power_bv_ledger) <> p.power_bv_ledger
     OR (SELECT count(*) FROM public.salary_business_event) <> p.salary_business_events
     OR (SELECT count(*) FROM public.salary_payout_event) <> p.salary_payout_events
     OR (SELECT count(*) FROM public.deposit_verifications) <> p.deposit_verifications
     OR (SELECT count(*) FROM public.withdrawal_events) <> p.withdrawal_events
     OR (SELECT count(*) FROM public.income_transfer_releases) <> p.income_transfer_releases
     OR (SELECT count(*) FROM public._prisma_migrations) <> p.prisma_migrations
     OR (SELECT count(*) FROM public.financial_discrepancies) <> p.financial_discrepancies
     OR (SELECT count(*) FROM public.reconciliation_reports) <> p.reconciliation_reports
     OR (SELECT count(*) FROM public.wallet_change_audit_logs) <> p.wallet_change_audit_logs
     OR (SELECT count(*) FROM public.job_execution_logs) <> p.job_execution_logs
     OR (SELECT count(*) FROM public.salary_run) <> p.salary_runs
     OR (SELECT count(*) FROM public.salary_run_audit) <> p.salary_run_audits THEN
    RAISE EXCEPTION 'A protected table row count changed';
  END IF;

  -- Compare complete protected rows, not just counts. These comparisons never
  -- return row contents; hashes/configuration values remain in temp tables.
  FOR protected_table IN
    SELECT * FROM (VALUES
      ('admins', 'phase0c_admins_snapshot'),
      ('system_settings', 'phase0c_system_settings_snapshot'),
      ('salary_rank_config', 'phase0c_salary_rank_config_snapshot'),
      ('withdrawal_settings', 'phase0c_withdrawal_settings_snapshot'),
      ('company_wallets', 'phase0c_company_wallets_snapshot'),
      ('financial_ledger', 'phase0c_financial_ledger_snapshot'),
      ('bv_history', 'phase0c_bv_history_snapshot'),
      ('salary_bv_ledger', 'phase0c_salary_bv_ledger_snapshot'),
      ('power_bv_ledger', 'phase0c_power_bv_ledger_snapshot'),
      ('salary_business_event', 'phase0c_salary_business_event_snapshot'),
      ('salary_payout_event', 'phase0c_salary_payout_event_snapshot'),
      ('deposit_verifications', 'phase0c_deposit_verifications_snapshot'),
      ('withdrawal_events', 'phase0c_withdrawal_events_snapshot'),
      ('income_transfer_releases', 'phase0c_income_transfer_releases_snapshot'),
      ('_prisma_migrations', 'phase0c_prisma_migrations_snapshot'),
      ('bulk_password_reset_runs', 'phase0c_bulk_reset_runs_snapshot'),
      ('common_temporary_password_reset_runs', 'phase0c_common_reset_runs_snapshot'),
      ('financial_discrepancies', 'phase0c_financial_discrepancies_snapshot'),
      ('reconciliation_reports', 'phase0c_reconciliation_reports_snapshot'),
      ('wallet_change_audit_logs', 'phase0c_wallet_change_audit_snapshot'),
      ('job_execution_logs', 'phase0c_job_logs_snapshot'),
      ('salary_run', 'phase0c_salary_runs_snapshot'),
      ('salary_run_audit', 'phase0c_salary_run_audit_snapshot')
    ) AS snapshots(table_name, snapshot_name)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM ((SELECT * FROM public.%I EXCEPT SELECT * FROM pg_temp.%I) UNION ALL (SELECT * FROM pg_temp.%I EXCEPT SELECT * FROM public.%I)) AS changed_rows',
      protected_table.table_name, protected_table.snapshot_name,
      protected_table.snapshot_name, protected_table.table_name
    ) INTO difference_count;
    IF difference_count <> 0 THEN
      RAISE EXCEPTION 'Protected rows changed in table %', protected_table.table_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT id, "adminId", action, "targetUserId", details, "createdAt"
    FROM phase0c_admin_logs_snapshot
    EXCEPT
    SELECT id, "adminId", action, "targetUserId", details, "createdAt"
    FROM public.admin_logs
  ) OR EXISTS (
    SELECT id, "adminId", action, "targetUserId", details, "createdAt"
    FROM public.admin_logs
    EXCEPT
    SELECT id, "adminId", action, "targetUserId", details, "createdAt"
    FROM phase0c_admin_logs_snapshot
  ) THEN
    RAISE EXCEPTION 'Admin audit rows changed beyond expected target-user SET NULL';
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
    SELECT child_ns.nspname AS child_schema,
           child.relname AS child_table,
           child_col.attname AS child_column,
           parent_ns.nspname AS parent_schema,
           parent.relname AS parent_table,
           parent_col.attname AS parent_column
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_attribute child_col
      ON child_col.attrelid = con.conrelid
     AND child_col.attnum = con.conkey[1]
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_attribute parent_col
      ON parent_col.attrelid = con.confrelid
     AND parent_col.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND child_ns.nspname = 'public'
    ORDER BY child.relname, con.conname
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
