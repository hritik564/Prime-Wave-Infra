-- PrimeWave V1 Production reset preparation: READ-ONLY preflight.
-- Run only against the verified V1 Production primary after writers are stopped.
-- This file performs no INSERT, UPDATE, DELETE, DDL, or migration.

\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_user AS connected_role,
       current_setting('transaction_read_only') AS transaction_read_only;

-- Counts only; does not return member or credential data.
SELECT count(*) AS total_users,
       count(*) FILTER (WHERE lower(username) = 'master') AS master_users,
       count(*) FILTER (WHERE lower(username) <> 'master') AS ordinary_members
FROM public.users;

SELECT count(*) AS admin_accounts FROM public.admins;

-- Report presence of the reset-relevant tables, including schema drift from
-- the existing Phase 0C candidate and the Single Plan migration.
WITH expected(table_name) AS (
  VALUES
    ('users'), ('admins'), ('admin_logs'), ('_prisma_migrations'),
    ('system_settings'), ('salary_rank_config'), ('withdrawal_settings'),
    ('company_wallets'), ('wallets'), ('wallet_transactions'),
    ('investments'), ('single_plan_accounts'), ('single_plan_events'),
    ('single_plan_cycles'), ('roi_ledger'), ('deposit_requests'),
    ('deposit_verifications'), ('withdrawal_requests'), ('withdrawal_events'),
    ('income_transfers'), ('income_transfer_releases'), ('manual_deposit_idempotency'),
    ('referral_history'), ('level_income'), ('match_bv_ledger'),
    ('orbit_bv_ledger'), ('salary_bv_ledger'), ('bv_history'),
    ('binary_match_income'), ('binary_orbit_income'), ('power_bv_ledger'),
    ('salary_achievement'), ('salary_business_summary'),
    ('salary_business_event'), ('salary_income'), ('salary_payout_event'),
    ('salary_run'), ('salary_run_audit'), ('password_reset_tokens'),
    ('impersonation_sessions'), ('notifications'), ('wallet_addresses'),
    ('financial_ledger'), ('financial_discrepancies'),
    ('reconciliation_reports'), ('wallet_change_audit_logs'),
    ('bulk_password_reset_runs'), ('common_temporary_password_reset_runs'),
    ('job_execution_logs')
)
SELECT e.table_name,
       to_regclass(format('public.%I', e.table_name)) IS NOT NULL AS exists_in_production
FROM expected e
ORDER BY e.table_name;

-- Actual columns for the relevant tables; use this to detect schema drift
-- without exporting rows or credential values.
SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'admins', 'wallets', 'salary_business_summary',
    'single_plan_accounts', 'single_plan_events', 'single_plan_cycles',
    'withdrawal_requests', 'withdrawal_events', 'income_transfers',
    'income_transfer_releases', 'financial_ledger',
    'financial_discrepancies', 'reconciliation_reports'
  )
ORDER BY table_name, ordinal_position;

-- All foreign keys that touch reset-relevant tables, with delete behavior.
SELECT child_ns.nspname AS child_schema,
       child.relname AS child_table,
       con.conname AS constraint_name,
       parent_ns.nspname AS parent_schema,
       parent.relname AS parent_table,
       CASE con.confdeltype
         WHEN 'a' THEN 'NO ACTION'
         WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE'
         WHEN 'n' THEN 'SET NULL'
         WHEN 'd' THEN 'SET DEFAULT'
         ELSE con.confdeltype::text
       END AS on_delete
FROM pg_constraint con
JOIN pg_class child ON child.oid = con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
JOIN pg_class parent ON parent.oid = con.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
WHERE con.contype = 'f'
  AND (child_ns.nspname = 'public' OR parent_ns.nspname = 'public')
  AND (
    child.relname IN (
      'users', 'wallets', 'wallet_transactions', 'investments',
      'single_plan_accounts', 'single_plan_events', 'single_plan_cycles',
      'roi_ledger', 'deposit_requests', 'deposit_verifications',
      'withdrawal_requests', 'withdrawal_events', 'income_transfers',
      'income_transfer_releases', 'referral_history', 'level_income',
      'match_bv_ledger', 'orbit_bv_ledger', 'salary_bv_ledger', 'bv_history',
      'binary_match_income', 'binary_orbit_income', 'power_bv_ledger',
      'salary_achievement', 'salary_business_summary', 'salary_business_event',
      'salary_income', 'salary_payout_event', 'salary_run', 'salary_run_audit',
      'password_reset_tokens', 'impersonation_sessions', 'notifications',
      'wallet_addresses', 'admin_logs'
    )
    OR parent.relname IN (
      'users', 'wallets', 'investments', 'single_plan_accounts',
      'single_plan_events', 'deposit_requests', 'withdrawal_requests',
      'income_transfers', 'salary_income', 'salary_business_summary',
      'salary_run', 'admins'
    )
  )
ORDER BY child_ns.nspname, child.relname, con.conname;

-- Trigger inventory for tables a reset may touch.
SELECT ns.nspname AS schema_name,
       rel.relname AS table_name,
       trg.tgname AS trigger_name,
       pg_get_triggerdef(trg.oid, true) AS trigger_definition
FROM pg_trigger trg
JOIN pg_class rel ON rel.oid = trg.tgrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE NOT trg.tgisinternal
  AND ns.nspname = 'public'
  AND rel.relname IN (
    'users', 'admins', 'wallets', 'wallet_transactions', 'investments',
    'single_plan_accounts', 'single_plan_events', 'single_plan_cycles',
    'roi_ledger', 'deposit_requests', 'deposit_verifications',
    'withdrawal_requests', 'withdrawal_events', 'income_transfers',
    'income_transfer_releases', 'financial_ledger',
    'financial_discrepancies', 'reconciliation_reports'
  )
ORDER BY rel.relname, trg.tgname;

-- Unresolved external obligations must be reconciled separately; a database
-- reset or backup does not itself settle them.
SELECT status::text AS status, count(*) AS withdrawal_count
FROM public.withdrawal_requests
WHERE status::text NOT IN ('COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED')
GROUP BY status::text
ORDER BY status::text;

SELECT count(*) AS positive_transfer_remainders,
       coalesce(sum("remainingAmount"), 0) AS total_positive_remainder
FROM public.income_transfers
WHERE "remainingAmount" > 0;

-- Prisma history metadata only; no migration SQL or user data is returned.
SELECT count(*) AS migration_rows,
       count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
         AS successfully_applied_rows,
       max(migration_name) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
         AS lexically_latest_successful_migration
FROM public._prisma_migrations;

ROLLBACK;
