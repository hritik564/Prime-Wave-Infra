-- PRIMEWAVE V1 PHASE 0C.3 — GUARDED RESET TRANSACTION
--
-- PREPARATION ONLY. NOT APPROVED OR TESTED FOR PRODUCTION EXECUTION.
-- This file has a commit gate set to NO. Do not change it without separate
-- owner approval after isolated-restore testing and independent review.
--
-- Requires psql. Use a dedicated isolated restore first. The settlement and
-- archive CSVs are private operator files and must not be committed.
-- No foreign keys are disabled; no DELETE ... CASCADE is used.
--
-- Selected surviving identities:
--   Master:       pwmaster0000000000001
--   Super Admin:  6f67dde8-f7c6-4fff-8042-b28dd50191d7
-- Preserved run:
--   cmuaw52yf004vj1h61tpbr14w / FULL_REPLACEMENT / COMPLETED

\set ON_ERROR_STOP on
\if :{?expected_database}
\else
\set expected_database neondb
\endif
\if :{?expected_role}
\else
\set expected_role neondb_owner
\endif
\if :{?archive_verified}
\else
\set archive_verified NO
\endif
\if :{?settlements_verified}
\else
\set settlements_verified NO
\endif
\if :{?commit_approved}
\else
\set commit_approved NO
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';
SET LOCAL app.phase0c3_archive_verified = :'archive_verified';
SET LOCAL app.phase0c3_settlements_verified = :'settlements_verified';
SET LOCAL app.phase0c3_commit_approved = :'commit_approved';
SET LOCAL app.phase0c3_expected_database = :'expected_database';
SET LOCAL app.phase0c3_expected_role = :'expected_role';

-- Lock the actual Production table set from the owner-provided inventory.
-- This supplements, but does not replace, stopping all external writers.
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

-- External archive attestation. These fields do not prove authenticity by
-- themselves; an independent reviewer must verify the backup and restore.
CREATE TEMP TABLE phase0c3_archive_manifest (
  backup_sha256 text NOT NULL CHECK (backup_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  archive_reference text NOT NULL CHECK (length(trim(archive_reference)) > 0),
  pg_restore_list_verified boolean NOT NULL,
  isolated_restore_passed boolean NOT NULL,
  row_counts_reconciled boolean NOT NULL,
  retention_approval text NOT NULL CHECK (length(trim(retention_approval)) > 0),
  prepared_by text NOT NULL CHECK (length(trim(prepared_by)) > 0),
  independently_verified_by text NOT NULL
    CHECK (length(trim(independently_verified_by)) > 0),
  verified_at timestamptz NOT NULL,
  CHECK (prepared_by <> independently_verified_by)
) ON COMMIT DROP;
\copy phase0c3_archive_manifest FROM 'phase-0c-3-archive-manifest.csv' WITH (FORMAT csv, HEADER true)

-- One row for each nonterminal withdrawal and positive income-transfer
-- remainder. Evidence content is reviewed outside SQL; never invent rows.
CREATE TEMP TABLE phase0c3_settlement_manifest (
  record_type text NOT NULL
    CHECK (record_type IN ('withdrawal', 'income_transfer')),
  record_id text NOT NULL,
  database_status text NOT NULL,
  database_amount numeric NOT NULL,
  database_fee numeric,
  database_net_amount numeric,
  database_currency text,
  external_amount numeric NOT NULL CHECK (external_amount > 0),
  external_currency text NOT NULL CHECK (length(trim(external_currency)) > 0),
  external_reference text NOT NULL CHECK (length(trim(external_reference)) > 0),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  settled_at timestamptz NOT NULL,
  prepared_by text NOT NULL CHECK (length(trim(prepared_by)) > 0),
  independently_verified_by text NOT NULL
    CHECK (length(trim(independently_verified_by)) > 0),
  PRIMARY KEY (record_type, record_id),
  CHECK (prepared_by <> independently_verified_by)
) ON COMMIT DROP;
\copy phase0c3_settlement_manifest FROM 'phase-0c-3-settlement-manifest.csv' WITH (FORMAT csv, HEADER true)

-- Keep hashes/credentials private: snapshots are temporary and never selected
-- into psql output. The Master network fields intentionally reset below.
CREATE TEMP TABLE phase0c3_master_identity_snapshot ON COMMIT DROP AS
SELECT
  id, email, phone, username, "passwordHash", "passwordResetRequired",
  "authVersion", "passwordChangedAt", "fullReplacementPasswordResetRunId",
  "firstName", "lastName", "referralCode", "walletAddress", "telegramId",
  "profileImage", "createdAt", "isTestUser", status,
  "withdrawalHold", "withdrawalHoldReason", "withdrawalHoldBy",
  "withdrawalHoldAt"
FROM public.users
WHERE id = 'pwmaster0000000000001';

CREATE TEMP TABLE phase0c3_master_wallet_identity_snapshot ON COMMIT DROP AS
SELECT id, "userId", "createdAt"
FROM public.wallets
WHERE "userId" = 'pwmaster0000000000001';

CREATE TEMP TABLE phase0c3_master_wallet_addresses_snapshot ON COMMIT DROP AS
SELECT *
FROM public.wallet_addresses
WHERE "userId" = 'pwmaster0000000000001';

CREATE TEMP TABLE phase0c3_master_salary_identity_snapshot ON COMMIT DROP AS
SELECT id, "userId", "createdAt"
FROM public.salary_business_summary
WHERE "userId" = 'pwmaster0000000000001';

CREATE TEMP TABLE phase0c3_kept_admin_snapshot ON COMMIT DROP AS
SELECT *
FROM public.admins
WHERE id = '6f67dde8-f7c6-4fff-8042-b28dd50191d7';

CREATE TEMP TABLE phase0c3_full_replacement_snapshot ON COMMIT DROP AS
SELECT *
FROM public.common_temporary_password_reset_runs
WHERE id = 'cmuaw52yf004vj1h61tpbr14w';

CREATE TEMP TABLE phase0c3_system_settings_snapshot ON COMMIT DROP AS
SELECT * FROM public.system_settings;
CREATE TEMP TABLE phase0c3_salary_rank_config_snapshot ON COMMIT DROP AS
SELECT * FROM public.salary_rank_config;
CREATE TEMP TABLE phase0c3_withdrawal_settings_snapshot ON COMMIT DROP AS
SELECT * FROM public.withdrawal_settings;
CREATE TEMP TABLE phase0c3_company_wallets_snapshot ON COMMIT DROP AS
SELECT * FROM public.company_wallets;
CREATE TEMP TABLE phase0c3_migrations_snapshot ON COMMIT DROP AS
SELECT * FROM public._prisma_migrations;

DO $preflight$
DECLARE
  archive_record record;
  open_withdrawals integer;
  positive_transfers integer;
  foreign_key_count integer;
BEGIN
  IF current_database() IS DISTINCT FROM current_setting('app.phase0c3_expected_database')
     OR current_user IS DISTINCT FROM current_setting('app.phase0c3_expected_role') THEN
    RAISE EXCEPTION 'Unexpected database or role; stop without retrying';
  END IF;

  IF current_setting('app.phase0c3_archive_verified') IS DISTINCT FROM 'YES'
     OR current_setting('app.phase0c3_settlements_verified') IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'Archive and external-settlement approvals are required';
  END IF;
  SELECT * INTO archive_record FROM phase0c3_archive_manifest;
  IF NOT FOUND
     OR (SELECT count(*) FROM phase0c3_archive_manifest) <> 1
     OR NOT archive_record.pg_restore_list_verified
     OR NOT archive_record.isolated_restore_passed
     OR NOT archive_record.row_counts_reconciled
     OR archive_record.verified_at > CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'A verified archive manifest is required';
  END IF;

  IF (SELECT count(*) FROM public.users) <> 6689
     OR (SELECT count(*) FROM public.users
         WHERE id = 'pwmaster0000000000001'
           AND lower(username) = 'master') <> 1
     OR (SELECT count(*) FROM public.admins) <> 4 THEN
    RAISE EXCEPTION 'Account counts or Master identity differ from the owner preflight';
  END IF;

  -- Assert the complete four-admin set from the owner-side query. Only the
  -- selected active SUPER_ADMIN is retained; no hash or email is emitted.
  IF (SELECT count(*) FROM public.admins
      WHERE (id = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
             AND role::text = 'SUPER_ADMIN' AND "isActive" = true)
         OR (id = 'cmqt4boj5000022p27cavzwi9'
             AND role::text = 'SUPER_ADMIN' AND "isActive" = false)
         OR (id = 'cmtv9dew00000z356k1zc2c7a'
             AND role::text = 'SUPER_ADMIN' AND "isActive" = true)
         OR (id = 'support1'
             AND role::text = 'SUPPORT_ADMIN' AND "isActive" = false)) <> 4
     OR (SELECT count(*) FROM phase0c3_kept_admin_snapshot) <> 1 THEN
    RAISE EXCEPTION 'Admin IDs, roles, or active states differ from owner confirmation';
  END IF;

  IF (SELECT count(*) FROM phase0c3_master_identity_snapshot) <> 1
     OR (SELECT count(*) FROM phase0c3_master_wallet_identity_snapshot) <> 1
     OR (SELECT count(*) FROM phase0c3_master_salary_identity_snapshot) <> 1 THEN
    RAISE EXCEPTION 'Master identity, wallet, or salary summary is missing/ambiguous';
  END IF;

  IF (SELECT count(*) FROM phase0c3_full_replacement_snapshot) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM phase0c3_full_replacement_snapshot
       WHERE "adminId" = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
         AND "operationType"::text = 'FULL_REPLACEMENT'
         AND status::text = 'COMPLETED'
     ) THEN
    RAISE EXCEPTION 'The confirmed completed FULL_REPLACEMENT run is not as expected';
  END IF;

  IF to_regclass('public.single_plan_accounts') IS NOT NULL
     OR to_regclass('public.single_plan_events') IS NOT NULL
     OR to_regclass('public.single_plan_cycles') IS NOT NULL THEN
    RAISE EXCEPTION 'Single Plan tables appeared; refresh the Production inventory';
  END IF;

  SELECT count(*) INTO foreign_key_count
  FROM pg_constraint
  WHERE contype = 'f' AND connamespace = 'public'::regnamespace;
  IF foreign_key_count <> 60 OR EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND cardinality(conkey) <> 1
  ) THEN
    RAISE EXCEPTION 'Foreign-key inventory changed; review before continuing';
  END IF;

  -- Stop if any newly added table references a reset parent and is not in the
  -- reviewed Production child inventory.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE con.contype = 'f'
      AND parent_ns.nspname = 'public'
      AND parent.relname IN (
        'users', 'admins', 'wallets', 'investments', 'deposit_requests',
        'withdrawal_requests', 'income_transfers', 'salary_income',
        'salary_run', 'salary_business_summary'
      )
      AND child_ns.nspname = 'public'
      AND child.relname NOT IN (
        'admin_logs', 'binary_match_income', 'binary_orbit_income',
        'bulk_password_reset_runs', 'bv_history',
        'common_temporary_password_reset_runs', 'deposit_requests',
        'deposit_verifications', 'impersonation_sessions',
        'income_transfer_releases', 'income_transfers', 'investments',
        'level_income', 'match_bv_ledger', 'notifications', 'orbit_bv_ledger',
        'password_reset_tokens', 'power_bv_ledger', 'referral_history',
        'roi_ledger', 'salary_achievement', 'salary_business_event',
        'salary_business_summary', 'salary_bv_ledger', 'salary_income',
        'salary_payout_event', 'salary_run_audit', 'users', 'wallet_addresses',
        'wallet_transactions', 'wallets', 'withdrawal_events',
        'withdrawal_requests'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected foreign-key child exists; refresh the deletion plan';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger trg
    JOIN pg_class rel ON rel.oid = trg.tgrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND NOT trg.tgisinternal
      AND rel.relname IN (
        'admin_logs', 'admins', 'binary_match_income', 'binary_orbit_income',
        'bulk_password_reset_runs', 'bv_history',
        'common_temporary_password_reset_runs', 'deposit_requests',
        'deposit_verifications', 'financial_discrepancies', 'financial_ledger',
        'impersonation_sessions', 'income_transfer_releases', 'income_transfers',
        'investments', 'job_execution_logs', 'level_income',
        'manual_deposit_idempotency', 'match_bv_ledger', 'notifications',
        'orbit_bv_ledger', 'password_reset_tokens', 'power_bv_ledger',
        'reconciliation_reports', 'referral_history', 'roi_ledger',
        'salary_achievement', 'salary_business_event', 'salary_business_summary',
        'salary_bv_ledger', 'salary_income', 'salary_payout_event',
        'salary_run', 'salary_run_audit', 'users', 'wallet_addresses',
        'wallet_change_audit_logs', 'wallet_transactions', 'wallets',
        'withdrawal_events', 'withdrawal_requests'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected user-defined trigger found; review side effects';
  END IF;

  SELECT count(*) INTO open_withdrawals
  FROM public.withdrawal_requests
  WHERE status::text NOT IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED');
  SELECT count(*) INTO positive_transfers
  FROM public.income_transfers
  WHERE "remainingAmount" > 0;
  IF open_withdrawals <> 11
     OR (SELECT count(*) FROM public.withdrawal_requests
         WHERE status::text = 'PENDING') <> 10
     OR (SELECT count(*) FROM public.withdrawal_requests
         WHERE status::text = 'MANUAL_REVIEW') <> 1
     OR positive_transfers <> 3
     OR (SELECT coalesce(sum("remainingAmount"), 0)
         FROM public.income_transfers
         WHERE "remainingAmount" > 0) <> 2.76013842 THEN
    RAISE EXCEPTION 'Open obligations differ from owner preflight; refresh evidence';
  END IF;
  IF (SELECT count(*) FROM phase0c3_settlement_manifest
      WHERE record_type = 'withdrawal') <> open_withdrawals
     OR (SELECT count(*) FROM phase0c3_settlement_manifest
         WHERE record_type = 'income_transfer') <> positive_transfers THEN
    RAISE EXCEPTION 'Settlement manifest must cover all 11 withdrawals and 3 transfers';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.withdrawal_requests w
    LEFT JOIN phase0c3_settlement_manifest m
      ON m.record_type = 'withdrawal' AND m.record_id = w.id
    WHERE w.status::text NOT IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')
      AND (
        m.record_id IS NULL
        OR m.database_status IS DISTINCT FROM w.status::text
        OR m.database_amount IS DISTINCT FROM w.amount
        OR m.database_fee IS DISTINCT FROM w.fee
        OR m.database_net_amount IS DISTINCT FROM w."netAmount"
        OR m.database_currency IS DISTINCT FROM w.currency
        OR m.external_amount IS DISTINCT FROM w."netAmount"
        OR m.external_currency IS DISTINCT FROM w.currency
        OR m.settled_at > CURRENT_TIMESTAMP
      )
  ) OR EXISTS (
    SELECT 1
    FROM phase0c3_settlement_manifest m
    LEFT JOIN public.withdrawal_requests w ON w.id = m.record_id
    WHERE m.record_type = 'withdrawal'
      AND (w.id IS NULL
        OR w.status::text IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Withdrawal settlement manifest does not match current records';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.income_transfers t
    LEFT JOIN phase0c3_settlement_manifest m
      ON m.record_type = 'income_transfer' AND m.record_id = t.id
    WHERE t."remainingAmount" > 0
      AND (
        m.record_id IS NULL
        OR m.database_status IS DISTINCT FROM 'REMAINING_AMOUNT'
        OR m.database_amount IS DISTINCT FROM t."remainingAmount"
        OR m.database_fee IS NOT NULL
        OR m.database_net_amount IS NOT NULL
        OR m.database_currency IS NOT NULL
        OR m.external_amount IS DISTINCT FROM t."remainingAmount"
        OR m.settled_at > CURRENT_TIMESTAMP
      )
  ) OR EXISTS (
    SELECT 1
    FROM phase0c3_settlement_manifest m
    LEFT JOIN public.income_transfers t ON t.id = m.record_id
    WHERE m.record_type = 'income_transfer'
      AND (t.id IS NULL OR t."remainingAmount" <= 0)
  ) THEN
    RAISE EXCEPTION 'Transfer settlement manifest does not match current records';
  END IF;

  IF EXISTS (
    SELECT 1 FROM phase0c3_settlement_manifest
    WHERE length(trim(external_reference)) = 0
       OR length(trim(external_currency)) = 0
       OR prepared_by = independently_verified_by
       OR settled_at > CURRENT_TIMESTAMP
  ) THEN
    RAISE EXCEPTION 'Settlement evidence is incomplete or not independently reviewed';
  END IF;
END
$preflight$;

-- Child rows are removed explicitly before parents. The verified external
-- archive must retain the original rows, statuses, and migration history.
DELETE FROM public.wallet_transactions;
DELETE FROM public.withdrawal_events;
DELETE FROM public.deposit_verifications;
DELETE FROM public.income_transfer_releases;
DELETE FROM public.salary_payout_event;
DELETE FROM public.salary_run_audit;
DELETE FROM public.power_bv_ledger;
DELETE FROM public.bv_history;
DELETE FROM public.salary_bv_ledger;
DELETE FROM public.match_bv_ledger;
DELETE FROM public.orbit_bv_ledger;
DELETE FROM public.roi_ledger;
DELETE FROM public.level_income;
DELETE FROM public.salary_business_event;
DELETE FROM public.salary_achievement;
DELETE FROM public.binary_match_income;
DELETE FROM public.binary_orbit_income;
DELETE FROM public.salary_income;
DELETE FROM public.referral_history;
DELETE FROM public.manual_deposit_idempotency;
DELETE FROM public.password_reset_tokens
WHERE "userId" <> 'pwmaster0000000000001';
DELETE FROM public.impersonation_sessions;
DELETE FROM public.notifications
WHERE "userId" <> 'pwmaster0000000000001';
DELETE FROM public.wallet_addresses
WHERE "userId" <> 'pwmaster0000000000001';
DELETE FROM public.salary_business_summary
WHERE "userId" <> 'pwmaster0000000000001';
DELETE FROM public.deposit_requests;
DELETE FROM public.withdrawal_requests;
DELETE FROM public.income_transfers;
DELETE FROM public.investments;
DELETE FROM public.wallets
WHERE "userId" <> 'pwmaster0000000000001';
DELETE FROM public.salary_run;

-- Remove active historical Treasury/audit data only after the verified
-- external archive gate above. The completed FULL_REPLACEMENT row is exempt.
DELETE FROM public.financial_ledger;
DELETE FROM public.financial_discrepancies;
DELETE FROM public.reconciliation_reports;
DELETE FROM public.wallet_change_audit_logs;
DELETE FROM public.job_execution_logs;
DELETE FROM public.admin_logs;
DELETE FROM public.bulk_password_reset_runs;
DELETE FROM public.common_temporary_password_reset_runs
WHERE id <> 'cmuaw52yf004vj1h61tpbr14w';

-- Clear Master's network and operating counters, not identity/auth fields.
UPDATE public.users
SET "referredBy" = NULL,
    "sponsorId" = NULL,
    "binaryParentId" = NULL,
    position = NULL,
    "leftDeepestNodeId" = NULL,
    "rightDeepestNodeId" = NULL,
    "directReferralCount" = 0,
    "directLeftCount" = 0,
    "directRightCount" = 0,
    "leftBV" = 0,
    "rightBV" = 0,
    "powerLeftBV" = 0,
    "powerRightBV" = 0,
    "matchingLeftBV" = 0,
    "matchingRightBV" = 0,
    "orbitLeftBV" = 0,
    "orbitRightBV" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id = 'pwmaster0000000000001';

UPDATE public.wallets
SET "depositWallet" = 0,
    "incomeWallet" = 0,
    "withdrawalWallet" = 0,
    "lockedWithdrawalBalance" = 0,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" = 'pwmaster0000000000001';

UPDATE public.salary_business_summary
SET "directBusiness" = 0,
    "downlineBusiness" = 0,
    "powerBusiness" = 0,
    "lastReconciledAt" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "userId" = 'pwmaster0000000000001';

-- User self-references use NO ACTION. Detach the old tree, then remove members.
UPDATE public.users
SET "sponsorId" = NULL, "binaryParentId" = NULL
WHERE id <> 'pwmaster0000000000001';
DELETE FROM public.users
WHERE id <> 'pwmaster0000000000001';

-- Remove the other three Admin accounts only after every observed child FK has
-- been handled. The surviving Admin and completed reset run remain unchanged.
DELETE FROM public.admins
WHERE id IN (
  'cmqt4boj5000022p27cavzwi9',
  'cmtv9dew00000z356k1zc2c7a',
  'support1'
);

DO $verify$
DECLARE
  protected_table record;
  diff_count bigint;
  fk record;
  orphan_count bigint;
BEGIN
  IF (SELECT count(*) FROM public.users) <> 1
     OR (SELECT count(*) FROM public.users
         WHERE id = 'pwmaster0000000000001' AND lower(username) = 'master') <> 1
     OR (SELECT count(*) FROM public.admins) <> 1
     OR (SELECT count(*) FROM public.admins
         WHERE id = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
           AND role::text = 'SUPER_ADMIN' AND "isActive" = true) <> 1
     OR (SELECT count(*) FROM public.wallets) <> 1 THEN
    RAISE EXCEPTION 'Required final Master/Admin/wallet counts were not reached';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallets
    WHERE "userId" = 'pwmaster0000000000001'
      AND ("depositWallet" <> 0 OR "incomeWallet" <> 0
        OR "withdrawalWallet" <> 0 OR "lockedWithdrawalBalance" <> 0)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = 'pwmaster0000000000001'
      AND "referredBy" IS NULL AND "sponsorId" IS NULL
      AND "binaryParentId" IS NULL AND position IS NULL
      AND "leftDeepestNodeId" IS NULL AND "rightDeepestNodeId" IS NULL
      AND "directReferralCount" = 0 AND "directLeftCount" = 0
      AND "directRightCount" = 0
      AND "leftBV" = 0 AND "rightBV" = 0
      AND "powerLeftBV" = 0 AND "powerRightBV" = 0
      AND "matchingLeftBV" = 0 AND "matchingRightBV" = 0
      AND "orbitLeftBV" = 0 AND "orbitRightBV" = 0
  ) THEN
    RAISE EXCEPTION 'Master wallet/network/BV values are not zero';
  END IF;

  IF (SELECT count(*) FROM public.investments) <> 0
     OR (SELECT count(*) FROM public.roi_ledger) <> 0
     OR (SELECT count(*) FROM public.wallet_transactions) <> 0
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
     OR (SELECT count(*) FROM public.salary_income) <> 0
     OR (SELECT count(*) FROM public.salary_payout_event) <> 0
     OR (SELECT count(*) FROM public.salary_run) <> 0
     OR (SELECT count(*) FROM public.salary_run_audit) <> 0
     OR (SELECT count(*) FROM public.financial_ledger) <> 0
     OR (SELECT count(*) FROM public.financial_discrepancies) <> 0
     OR (SELECT count(*) FROM public.reconciliation_reports) <> 0
     OR (SELECT count(*) FROM public.wallet_change_audit_logs) <> 0
     OR (SELECT count(*) FROM public.job_execution_logs) <> 0
     OR (SELECT count(*) FROM public.admin_logs) <> 0
     OR (SELECT count(*) FROM public.bulk_password_reset_runs) <> 0
     OR EXISTS (
       SELECT 1 FROM public.common_temporary_password_reset_runs
       WHERE id <> 'cmuaw52yf004vj1h61tpbr14w'
     ) THEN
    RAISE EXCEPTION 'One or more operational/history tables are not reset';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.password_reset_tokens
    WHERE "userId" <> 'pwmaster0000000000001'
  ) OR EXISTS (
    SELECT 1 FROM public.impersonation_sessions
  ) OR EXISTS (
    SELECT 1 FROM public.notifications
    WHERE "userId" <> 'pwmaster0000000000001'
  ) OR EXISTS (
    SELECT 1 FROM public.wallet_addresses
    WHERE "userId" <> 'pwmaster0000000000001'
  ) OR EXISTS (
    SELECT 1 FROM public.salary_business_summary
    WHERE "userId" <> 'pwmaster0000000000001'
       OR "directBusiness" <> 0
       OR "downlineBusiness" <> 0
       OR "powerBusiness" <> 0
  ) THEN
    RAISE EXCEPTION 'Member operational references or nonzero summary remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM phase0c3_master_identity_snapshot s
    LEFT JOIN public.users u ON u.id = s.id
    WHERE u.id IS NULL
       OR ROW(
         u.email, u.phone, u.username, u."passwordHash",
         u."passwordResetRequired", u."authVersion", u."passwordChangedAt",
         u."fullReplacementPasswordResetRunId", u."firstName", u."lastName",
         u."referralCode", u."walletAddress", u."telegramId", u."profileImage",
         u."createdAt", u."isTestUser", u.status, u."withdrawalHold",
         u."withdrawalHoldReason", u."withdrawalHoldBy", u."withdrawalHoldAt"
       ) IS DISTINCT FROM ROW(
         s.email, s.phone, s.username, s."passwordHash",
         s."passwordResetRequired", s."authVersion", s."passwordChangedAt",
         s."fullReplacementPasswordResetRunId", s."firstName", s."lastName",
         s."referralCode", s."walletAddress", s."telegramId", s."profileImage",
         s."createdAt", s."isTestUser", s.status, s."withdrawalHold",
         s."withdrawalHoldReason", s."withdrawalHoldBy", s."withdrawalHoldAt"
       )
  ) THEN
    RAISE EXCEPTION 'Master identity/authentication state changed';
  END IF;

  IF EXISTS (
    SELECT * FROM phase0c3_master_wallet_identity_snapshot
    EXCEPT
    SELECT id, "userId", "createdAt" FROM public.wallets
    WHERE "userId" = 'pwmaster0000000000001'
  ) OR EXISTS (
    SELECT id, "userId", "createdAt" FROM public.wallets
    WHERE "userId" = 'pwmaster0000000000001'
    EXCEPT
    SELECT * FROM phase0c3_master_wallet_identity_snapshot
  ) THEN
    RAISE EXCEPTION 'Master wallet identity changed';
  END IF;

  IF EXISTS (
    SELECT * FROM phase0c3_master_wallet_addresses_snapshot
    EXCEPT
    SELECT * FROM public.wallet_addresses
    WHERE "userId" = 'pwmaster0000000000001'
  ) OR EXISTS (
    SELECT * FROM public.wallet_addresses
    WHERE "userId" = 'pwmaster0000000000001'
    EXCEPT
    SELECT * FROM phase0c3_master_wallet_addresses_snapshot
  ) THEN
    RAISE EXCEPTION 'Master wallet-address identity changed';
  END IF;

  IF EXISTS (
    SELECT * FROM phase0c3_master_salary_identity_snapshot
    EXCEPT
    SELECT id, "userId", "createdAt" FROM public.salary_business_summary
    WHERE "userId" = 'pwmaster0000000000001'
  ) OR EXISTS (
    SELECT id, "userId", "createdAt" FROM public.salary_business_summary
    WHERE "userId" = 'pwmaster0000000000001'
    EXCEPT
    SELECT * FROM phase0c3_master_salary_identity_snapshot
  ) THEN
    RAISE EXCEPTION 'Master salary-summary identity changed';
  END IF;

  IF EXISTS (
    SELECT * FROM phase0c3_kept_admin_snapshot
    EXCEPT
    SELECT * FROM public.admins
    WHERE id = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
  ) OR EXISTS (
    SELECT * FROM public.admins
    WHERE id = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
    EXCEPT
    SELECT * FROM phase0c3_kept_admin_snapshot
  ) THEN
    RAISE EXCEPTION 'Selected Super Admin identity or credentials changed';
  END IF;

  IF EXISTS (
    SELECT * FROM phase0c3_full_replacement_snapshot
    EXCEPT
    SELECT * FROM public.common_temporary_password_reset_runs
    WHERE id = 'cmuaw52yf004vj1h61tpbr14w'
  ) OR EXISTS (
    SELECT * FROM public.common_temporary_password_reset_runs
    WHERE id = 'cmuaw52yf004vj1h61tpbr14w'
    EXCEPT
    SELECT * FROM phase0c3_full_replacement_snapshot
  ) THEN
    RAISE EXCEPTION 'Completed FULL_REPLACEMENT run changed or disappeared';
  END IF;

  FOR protected_table IN
    SELECT * FROM (VALUES
      ('system_settings', 'phase0c3_system_settings_snapshot'),
      ('salary_rank_config', 'phase0c3_salary_rank_config_snapshot'),
      ('withdrawal_settings', 'phase0c3_withdrawal_settings_snapshot'),
      ('company_wallets', 'phase0c3_company_wallets_snapshot'),
      ('_prisma_migrations', 'phase0c3_migrations_snapshot')
    ) AS snapshots(table_name, snapshot_name)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM ((SELECT * FROM public.%I EXCEPT SELECT * FROM pg_temp.%I) UNION ALL (SELECT * FROM pg_temp.%I EXCEPT SELECT * FROM public.%I)) AS changed_rows',
      protected_table.table_name, protected_table.snapshot_name,
      protected_table.snapshot_name, protected_table.table_name
    ) INTO diff_count;
    IF diff_count <> 0 THEN
      RAISE EXCEPTION 'Protected table changed: %', protected_table.table_name;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 40
     OR (SELECT count(*) FROM public._prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 39
     OR (SELECT max(migration_name) FILTER (
           WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ) FROM public._prisma_migrations)
        <> '20260924000000_full_replacement_password_ownership' THEN
    RAISE EXCEPTION 'Prisma migration history differs from owner preflight';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND cardinality(conkey) <> 1
  ) THEN
    RAISE EXCEPTION 'Composite foreign key found; update orphan validation';
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
      ON child_col.attrelid = con.conrelid AND child_col.attnum = con.conkey[1]
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_attribute parent_col
      ON parent_col.attrelid = con.confrelid AND parent_col.attnum = con.confkey[1]
    WHERE con.contype = 'f' AND child_ns.nspname = 'public'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I c LEFT JOIN %I.%I p ON c.%I = p.%I WHERE c.%I IS NOT NULL AND p.%I IS NULL',
      fk.child_schema, fk.child_table, fk.parent_schema, fk.parent_table,
      fk.child_column, fk.parent_column, fk.child_column, fk.parent_column
    ) INTO orphan_count;
    IF orphan_count <> 0 THEN
      RAISE EXCEPTION 'Foreign-key orphan found in %.% column %',
        fk.child_schema, fk.child_table, fk.child_column;
    END IF;
  END LOOP;

  IF current_setting('app.phase0c3_commit_approved') IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'COMMIT gate is disabled; transaction must roll back';
  END IF;
END
$verify$;

COMMIT;
