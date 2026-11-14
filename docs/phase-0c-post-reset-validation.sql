-- READ-ONLY checks for a future, separately approved Phase 0C reset.
-- Do not run a reset as part of this validation.

SELECT
  current_database() AS database_name,
  (SELECT count(*) FROM public.users) AS users,
  (SELECT count(*) FROM public.users WHERE lower(username) = 'master') AS master_matches,
  (SELECT count(*) FROM public.admins) AS admin_accounts,
  (SELECT count(*) FROM public.wallets) AS wallets,
  (SELECT count(*) FROM public.investments) AS investments,
  (SELECT count(*) FROM public.roi_ledger) AS roi_ledger_rows,
  (SELECT count(*) FROM public.wallet_transactions) AS wallet_transactions,
  (SELECT count(*) FROM public.financial_ledger) AS financial_ledger_rows,
  (SELECT count(*) FROM public.deposit_requests) AS deposits,
  (SELECT count(*) FROM public.deposit_verifications) AS deposit_verifications,
  (SELECT count(*) FROM public.withdrawal_requests) AS withdrawals,
  (SELECT count(*) FROM public.withdrawal_events) AS withdrawal_events,
  (SELECT count(*) FROM public.income_transfers) AS income_transfers,
  (SELECT count(*) FROM public.income_transfer_releases) AS income_transfer_releases,
  (SELECT count(*) FROM public.referral_history) AS referral_history,
  (SELECT count(*) FROM public.level_income) AS level_income,
  (SELECT count(*) FROM public.match_bv_ledger) AS match_bv_ledger,
  (SELECT count(*) FROM public.orbit_bv_ledger) AS orbit_bv_ledger,
  (SELECT count(*) FROM public.salary_bv_ledger) AS salary_bv_ledger,
  (SELECT count(*) FROM public.bv_history) AS bv_history,
  (SELECT count(*) FROM public.binary_match_income) AS binary_match_income,
  (SELECT count(*) FROM public.binary_orbit_income) AS binary_orbit_income,
  (SELECT count(*) FROM public.power_bv_ledger) AS power_bv_ledger,
  (SELECT count(*) FROM public.salary_achievement) AS salary_achievements,
  (SELECT count(*) FROM public.salary_business_event) AS salary_business_events,
  (SELECT count(*) FROM public.salary_payout_event) AS salary_payout_events,
  (SELECT count(*) FROM public.salary_income) AS salary_income,
  (SELECT count(*) FROM public.manual_deposit_idempotency) AS manual_deposit_idempotency,
  (SELECT count(*) FROM public.password_reset_tokens t
    WHERE NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = t."userId" AND lower(u.username) = 'master'))
    AS non_master_password_reset_tokens,
  (SELECT count(*) FROM public.impersonation_sessions s
    WHERE NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = s."targetUserId" AND lower(u.username) = 'master'))
    AS non_master_impersonation_sessions,
  (SELECT count(*) FROM public.notifications n
    WHERE NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = n."userId" AND lower(u.username) = 'master'))
    AS non_master_notifications,
  (SELECT count(*) FROM public.wallet_addresses a
    WHERE NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = a."userId" AND lower(u.username) = 'master'))
    AS non_master_wallet_addresses,
  (SELECT count(*) FROM public.salary_business_summary s
    WHERE NOT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.id = s."userId" AND lower(u.username) = 'master'))
    AS non_master_business_summaries,
  (SELECT count(*) FROM public.admin_logs) AS admin_logs,
  (SELECT count(*) FROM public.system_settings) AS system_settings,
  (SELECT count(*) FROM public.salary_rank_config) AS salary_rank_config,
  (SELECT count(*) FROM public.withdrawal_settings) AS withdrawal_settings,
  (SELECT count(*) FROM public.company_wallets) AS company_wallets,
  (SELECT count(*) FROM public.bulk_password_reset_runs) AS bulk_reset_runs,
  (SELECT count(*) FROM public.common_temporary_password_reset_runs) AS common_reset_runs,
  (SELECT count(*) FROM public.financial_discrepancies) AS financial_discrepancies,
  (SELECT count(*) FROM public.reconciliation_reports) AS reconciliation_reports,
  (SELECT count(*) FROM public.wallet_change_audit_logs) AS wallet_change_audit_logs,
  (SELECT count(*) FROM public._prisma_migrations) AS prisma_migration_rows;

SELECT
  (w."depositWallet" = 0
   AND w."incomeWallet" = 0
   AND w."withdrawalWallet" = 0
   AND w."lockedWithdrawalBalance" = 0) AS master_wallet_is_zero,
  (u."directReferralCount" = 0
   AND u."directLeftCount" = 0
   AND u."directRightCount" = 0
   AND u."leftBV" = 0 AND u."rightBV" = 0
   AND u."powerLeftBV" = 0 AND u."powerRightBV" = 0
   AND u."matchingLeftBV" = 0 AND u."matchingRightBV" = 0
   AND u."orbitLeftBV" = 0 AND u."orbitRightBV" = 0
   AND u."sponsorId" IS NULL AND u."binaryParentId" IS NULL
   AND u."leftDeepestNodeId" IS NULL AND u."rightDeepestNodeId" IS NULL)
    AS master_network_is_zero,
  (w."userId" = u.id) AS master_wallet_belongs_to_master
FROM public.users u
JOIN public.wallets w ON w."userId" = u.id
WHERE lower(u.username) = 'master';

SELECT
  count(*) AS nonzero_master_business_summaries
FROM public.salary_business_summary s
JOIN public.users u ON u.id = s."userId"
WHERE lower(u.username) = 'master'
  AND (s."directBusiness" <> 0
    OR s."downlineBusiness" <> 0
    OR s."powerBusiness" <> 0);

-- Must return zero rows. Current Production FKs are single-column.
DO $check_orphans$
DECLARE
  fk record;
  orphan_count bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND connamespace = 'public'::regnamespace
      AND cardinality(conkey) <> 1
  ) THEN
    RAISE EXCEPTION 'Composite foreign key found; update this validation query';
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
$check_orphans$;
