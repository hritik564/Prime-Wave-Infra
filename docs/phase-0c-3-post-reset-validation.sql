-- PrimeWave V1 Phase 0C.3 — READ-ONLY post-reset validation.
-- Isolated restore only. This file is barred from Production `neondb`.
-- It performs no writes and does not verify external archive custody.

\set ON_ERROR_STOP on
\if :{?expected_database}
\else
\echo 'ERROR: pass expected_database for an isolated v1_reset_test_* database'
\quit 1
\endif
\if :{?expected_role}
\else
\echo 'ERROR: pass expected_role for the isolated restore'
\quit 1
\endif
BEGIN TRANSACTION READ ONLY;
SET LOCAL app.phase0c3_expected_database = :'expected_database';
SET LOCAL app.phase0c3_expected_role = :'expected_role';
DO $target_guard$
BEGIN
  IF current_database() = 'neondb'
     OR current_database() !~ '^v1_reset_test_[a-z0-9_]+$'
     OR current_database() IS DISTINCT FROM
          current_setting('app.phase0c3_expected_database')
     OR current_user IS DISTINCT FROM
          current_setting('app.phase0c3_expected_role') THEN
    RAISE EXCEPTION 'Validation SQL is restricted to the named isolated test database';
  END IF;
END
$target_guard$;

SELECT current_database() AS database_name,
       current_user AS connected_role,
       current_setting('transaction_read_only') AS transaction_read_only;

-- No credential values are returned.
SELECT count(*) AS total_users,
       count(*) FILTER (WHERE id = 'pwmaster0000000000001'
                         AND lower(username) = 'master') AS protected_master,
       count(*) FILTER (WHERE lower(username) <> 'master') AS ordinary_members,
       (SELECT count(*) FROM public.admins) AS admin_accounts,
       (SELECT count(*) FROM public.admins
        WHERE id = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
          AND role::text = 'SUPER_ADMIN' AND "isActive" = true)
         AS selected_super_admin,
  (SELECT count(*) FROM public.wallets) AS user_wallets,
  (SELECT count(*) FROM public.salary_business_summary) AS salary_business_summaries;

SELECT
  w."depositWallet" = 0 AS master_deposit_zero,
  w."incomeWallet" = 0 AS master_income_zero,
  w."withdrawalWallet" = 0 AS master_withdrawal_zero,
  w."lockedWithdrawalBalance" = 0 AS master_locked_zero,
  u."referredBy" IS NULL
    AND u."sponsorId" IS NULL
    AND u."binaryParentId" IS NULL
    AND u.position IS NULL
    AND u."leftDeepestNodeId" IS NULL
    AND u."rightDeepestNodeId" IS NULL AS master_tree_cleared,
  u."directReferralCount" = 0
    AND u."directLeftCount" = 0
    AND u."directRightCount" = 0 AS master_referral_counters_zero,
  u."leftBV" = 0 AND u."rightBV" = 0
    AND u."powerLeftBV" = 0 AND u."powerRightBV" = 0
    AND u."matchingLeftBV" = 0 AND u."matchingRightBV" = 0
    AND u."orbitLeftBV" = 0 AND u."orbitRightBV" = 0 AS master_bv_zero
FROM public.users u
JOIN public.wallets w ON w."userId" = u.id
WHERE u.id = 'pwmaster0000000000001'
  AND lower(u.username) = 'master';

SELECT count(*) FILTER (
         WHERE u.id IS NULL OR lower(u.username) <> 'master'
       ) AS non_master_salary_summaries,
       (SELECT count(*)
        FROM public.salary_business_summary ms
        JOIN public.users mu ON mu.id = ms."userId"
        WHERE lower(mu.username) = 'master'
          AND (ms."directBusiness" <> 0
            OR ms."downlineBusiness" <> 0
            OR ms."powerBusiness" <> 0)
       ) AS nonzero_master_business_summaries
FROM public.salary_business_summary s
LEFT JOIN public.users u ON u.id = s."userId";

-- Every listed operational or Treasury-history table should be empty in the
-- active database after a separately approved, archive-backed reset.
SELECT 'wallet_transactions' AS table_name, count(*) AS rows FROM public.wallet_transactions
UNION ALL SELECT 'investments', count(*) FROM public.investments
UNION ALL SELECT 'roi_ledger', count(*) FROM public.roi_ledger
UNION ALL SELECT 'deposit_requests', count(*) FROM public.deposit_requests
UNION ALL SELECT 'deposit_verifications', count(*) FROM public.deposit_verifications
UNION ALL SELECT 'withdrawal_requests', count(*) FROM public.withdrawal_requests
UNION ALL SELECT 'withdrawal_events', count(*) FROM public.withdrawal_events
UNION ALL SELECT 'income_transfers', count(*) FROM public.income_transfers
UNION ALL SELECT 'income_transfer_releases', count(*) FROM public.income_transfer_releases
UNION ALL SELECT 'manual_deposit_idempotency', count(*) FROM public.manual_deposit_idempotency
UNION ALL SELECT 'referral_history', count(*) FROM public.referral_history
UNION ALL SELECT 'level_income', count(*) FROM public.level_income
UNION ALL SELECT 'match_bv_ledger', count(*) FROM public.match_bv_ledger
UNION ALL SELECT 'orbit_bv_ledger', count(*) FROM public.orbit_bv_ledger
UNION ALL SELECT 'salary_bv_ledger', count(*) FROM public.salary_bv_ledger
UNION ALL SELECT 'bv_history', count(*) FROM public.bv_history
UNION ALL SELECT 'binary_match_income', count(*) FROM public.binary_match_income
UNION ALL SELECT 'binary_orbit_income', count(*) FROM public.binary_orbit_income
UNION ALL SELECT 'power_bv_ledger', count(*) FROM public.power_bv_ledger
UNION ALL SELECT 'salary_achievement', count(*) FROM public.salary_achievement
UNION ALL SELECT 'salary_business_event', count(*) FROM public.salary_business_event
UNION ALL SELECT 'salary_income', count(*) FROM public.salary_income
UNION ALL SELECT 'salary_payout_event', count(*) FROM public.salary_payout_event
UNION ALL SELECT 'salary_run', count(*) FROM public.salary_run
UNION ALL SELECT 'salary_run_audit', count(*) FROM public.salary_run_audit
UNION ALL SELECT 'financial_ledger', count(*) FROM public.financial_ledger
UNION ALL SELECT 'financial_discrepancies', count(*) FROM public.financial_discrepancies
UNION ALL SELECT 'reconciliation_reports', count(*) FROM public.reconciliation_reports
UNION ALL SELECT 'wallet_change_audit_logs', count(*) FROM public.wallet_change_audit_logs
UNION ALL SELECT 'job_execution_logs', count(*) FROM public.job_execution_logs
UNION ALL SELECT 'admin_logs', count(*) FROM public.admin_logs
UNION ALL SELECT 'bulk_password_reset_runs', count(*) FROM public.bulk_password_reset_runs
ORDER BY table_name;

SELECT
  (SELECT count(*) FROM public.password_reset_tokens
   WHERE "userId" <> 'pwmaster0000000000001') AS non_master_reset_tokens,
  (SELECT count(*) FROM public.impersonation_sessions) AS impersonation_sessions,
  (SELECT count(*) FROM public.notifications
   WHERE "userId" <> 'pwmaster0000000000001') AS non_master_notifications,
  (SELECT count(*) FROM public.wallet_addresses
   WHERE "userId" <> 'pwmaster0000000000001') AS non_master_wallet_addresses,
  (SELECT count(*) FROM public.common_temporary_password_reset_runs
   WHERE id <> 'cmuaw52yf004vj1h61tpbr14w') AS other_reset_runs;

-- Values are intentionally not selected. Compare exact protected rows through
-- the reset transaction's in-transaction snapshots and the owner's baseline.
SELECT
  (SELECT count(*) FROM public.system_settings) AS system_settings,
  (SELECT count(*) FROM public.company_wallets) AS company_wallets,
  (SELECT count(*) FROM public.withdrawal_settings) AS withdrawal_settings,
  (SELECT count(*) FROM public.salary_rank_config) AS salary_rank_config,
  (SELECT count(*) FROM public._prisma_migrations) AS migration_rows,
  (SELECT count(*) FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)
      AS successfully_applied_migrations,
  (SELECT max(migration_name) FILTER (
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
   ) FROM public._prisma_migrations) AS latest_successful_migration,
  (SELECT count(*) FROM public.common_temporary_password_reset_runs
    WHERE id = 'cmuaw52yf004vj1h61tpbr14w'
      AND "adminId" = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
      AND "operationType"::text = 'FULL_REPLACEMENT'
      AND status::text = 'COMPLETED') AS preserved_full_replacement_run;

DO $assert_reset$
DECLARE
  t record;
  row_count bigint;
  fk record;
  orphan_count bigint;
BEGIN
  IF current_setting('transaction_read_only') <> 'on'
     OR current_database() IS DISTINCT FROM
          current_setting('app.phase0c3_expected_database')
     OR current_user IS DISTINCT FROM
          current_setting('app.phase0c3_expected_role') THEN
    RAISE EXCEPTION 'Wrong isolated-test target or transaction mode';
  END IF;

  IF (SELECT count(*) FROM public.users) <> 1
     OR (SELECT count(*) FROM public.users
         WHERE id = 'pwmaster0000000000001'
           AND lower(username) = 'master') <> 1
     OR (SELECT count(*) FROM public.users
         WHERE lower(username) <> 'master') <> 0
     OR (SELECT count(*) FROM public.admins) <> 1
     OR (SELECT count(*) FROM public.admins
         WHERE id = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
           AND role::text = 'SUPER_ADMIN' AND "isActive" = true) <> 1
      OR (SELECT count(*) FROM public.wallets) <> 1
      OR (SELECT count(*) FROM public.salary_business_summary) <> 1
      OR (SELECT count(*) FROM public.salary_business_summary
          WHERE "userId" = 'pwmaster0000000000001') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly Master, selected Super Admin, and Master wallet';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.wallets w ON w."userId" = u.id
    WHERE u.id = 'pwmaster0000000000001'
      AND lower(u.username) = 'master'
      AND w."depositWallet" = 0 AND w."incomeWallet" = 0
      AND w."withdrawalWallet" = 0 AND w."lockedWithdrawalBalance" = 0
      AND u."referredBy" IS NULL AND u."sponsorId" IS NULL
      AND u."binaryParentId" IS NULL AND u.position IS NULL
      AND u."leftDeepestNodeId" IS NULL AND u."rightDeepestNodeId" IS NULL
      AND u."directReferralCount" = 0
      AND u."directLeftCount" = 0 AND u."directRightCount" = 0
      AND u."leftBV" = 0 AND u."rightBV" = 0
      AND u."powerLeftBV" = 0 AND u."powerRightBV" = 0
      AND u."matchingLeftBV" = 0 AND u."matchingRightBV" = 0
      AND u."orbitLeftBV" = 0 AND u."orbitRightBV" = 0
  ) THEN
    RAISE EXCEPTION 'Master wallet/network/BV values are not reset';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.salary_business_summary s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = s."userId" AND u.id = 'pwmaster0000000000001'
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.salary_business_summary s
    WHERE s."userId" = 'pwmaster0000000000001'
      AND (s."directBusiness" <> 0
        OR s."downlineBusiness" <> 0
        OR s."powerBusiness" <> 0)
  ) THEN
    RAISE EXCEPTION 'Ordinary-member or nonzero Master salary summary remains';
  END IF;

  FOR t IN
    SELECT table_name
    FROM (VALUES
      ('wallet_transactions'), ('investments'), ('roi_ledger'),
      ('deposit_requests'), ('deposit_verifications'), ('withdrawal_requests'),
      ('withdrawal_events'), ('income_transfers'), ('income_transfer_releases'),
      ('manual_deposit_idempotency'), ('referral_history'), ('level_income'),
      ('match_bv_ledger'), ('orbit_bv_ledger'), ('salary_bv_ledger'),
      ('bv_history'), ('binary_match_income'), ('binary_orbit_income'),
      ('power_bv_ledger'), ('salary_achievement'), ('salary_business_event'),
      ('salary_income'), ('salary_payout_event'), ('salary_run'),
      ('salary_run_audit'), ('financial_ledger'), ('financial_discrepancies'),
      ('reconciliation_reports'), ('wallet_change_audit_logs'),
      ('job_execution_logs'), ('admin_logs'), ('bulk_password_reset_runs')
    ) AS expected(table_name)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t.table_name)
      INTO row_count;
    IF row_count <> 0 THEN
      RAISE EXCEPTION 'Expected reset table public.% to be empty', t.table_name;
    END IF;
  END LOOP;

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
    SELECT 1 FROM public.common_temporary_password_reset_runs
    WHERE id <> 'cmuaw52yf004vj1h61tpbr14w'
  ) THEN
    RAISE EXCEPTION 'Ordinary-member or obsolete reset references remain';
  END IF;

  IF (SELECT count(*) FROM public.common_temporary_password_reset_runs
      WHERE id = 'cmuaw52yf004vj1h61tpbr14w'
        AND "adminId" = '6f67dde8-f7c6-4fff-8042-b28dd50191d7'
        AND "operationType"::text = 'FULL_REPLACEMENT'
        AND status::text = 'COMPLETED') <> 1 THEN
    RAISE EXCEPTION 'Completed FULL_REPLACEMENT run is missing or changed';
  END IF;

  IF (SELECT count(*) FROM public._prisma_migrations) <> 40
     OR (SELECT count(*) FROM public._prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 39
     OR (SELECT max(migration_name) FILTER (
           WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
         ) FROM public._prisma_migrations)
        <> '20260924000000_full_replacement_password_ownership' THEN
    RAISE EXCEPTION 'Migration history aggregate differs from owner preflight';
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
END
$assert_reset$;

ROLLBACK;
