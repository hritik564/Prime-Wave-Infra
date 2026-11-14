# PrimeWave V1 Phase 0C.3 — Reset and isolated-test runbook

**Prepared only. No Production SQL was executed. The reset has not been tested on an isolated restore and is not approved for Production execution.**

## Protected identities confirmed by owner

- Master: `pwmaster0000000000001`.
- Sole surviving Admin: `6f67dde8-f7c6-4fff-8042-b28dd50191d7`, role `SUPER_ADMIN`, active.
- Other Admins to remove after all dependent records are handled:
  - `cmqt4boj5000022p27cavzwi9` — `SUPER_ADMIN`, inactive.
  - `cmtv9dew00000z356k1zc2c7a` — `SUPER_ADMIN`, active.
  - `support1` — `SUPPORT_ADMIN`, inactive.
- Completed run to preserve without changes: `cmuaw52yf004vj1h61tpbr14w`, owned by the selected Admin, `FULL_REPLACEMENT`, `COMPLETED`.

The reset transaction snapshots and compares the complete Master identity/authentication fields, selected Admin row, completed reset-run row, protected configuration, and Prisma migration rows. Password hashes and other protected values are not printed.

## Files and private input manifests

- `docs/phase-0c-3-final-reset.sql` — transaction with archive, financial-clearance, account, and commit gates. `commit_approved` defaults to `NO`.
- `docs/phase-0c-3-post-reset-validation.sql` — separate read-only validation; ends in `ROLLBACK`.
- `docs/phase-0c-3-archive-manifest.csv` — header-only template. Keep the populated copy private.
- `docs/phase-0c-3-financial-clearance-manifest.csv` — header-only template. Keep the populated copy private.

The SQL expects both populated CSVs in the psql working directory. Do not put evidence, full wallet addresses, credentials, or connection strings in the project repository. The archive manifest requires a fresh (no more than 24 hours old) backup, verified checksum, `pg_restore --list`, isolated restore result, row-count reconciliation, verified encryption and restricted access, retention approval recorded as `APPROVED:<reference>`, and distinct preparer/reviewer. It also requires every `bulk_password_reset_runs.artifactObjectPath` reference to be reconciled against private object storage and confirmed absent or deleted before its database metadata is removed. Do not preserve temporary-password artifacts in the financial archive. If private storage cannot be independently checked, stop. The financial-clearance manifest must contain an independently reviewed, owner-approved disposition for each of the 11 open withdrawals and 3 positive income-transfer remainders.

The flags `archive_verified=YES` and `financial_clearance_verified=YES` are operator attestations, not cryptographic proof. They must only be set after the evidence and owner-approved disposition are checked. The script does not pay, cancel, release, or change any withdrawal or transfer status; it fails unless all 14 current records have an independently reviewed disposition and matching amount/status snapshot.

Important: these transfer remainders are not external payouts. The application queues income-to-withdrawal-wallet credits across a 72-hour release schedule (`artifacts/api-server/src/wallets/income-transfer.service.ts` and `artifacts/api-server/src/cron/transfer.engine.ts`). Do not treat them as paid or externally settled without separate evidence. The owner must determine and document the approved disposition for each row before the reset can pass its gate.

## Expected delete/reset scope

The transaction explicitly clears:

- User operational/financial tables: `wallet_transactions`, `investments`, `roi_ledger`, `deposit_requests`, `deposit_verifications`, `withdrawal_requests`, `withdrawal_events`, `income_transfers`, `income_transfer_releases`, `manual_deposit_idempotency`, `referral_history`, `level_income`, `match_bv_ledger`, `orbit_bv_ledger`, `salary_bv_ledger`, `bv_history`, `binary_match_income`, `binary_orbit_income`, `power_bv_ledger`, `salary_achievement`, `salary_business_event`, `salary_payout_event`, `salary_income`, `salary_run_audit`, and `salary_run`.
- Member rows from `password_reset_tokens`, `notifications`, `wallet_addresses`, and `salary_business_summary`; all `impersonation_sessions`; ordinary `wallets`; then ordinary `users`.
- Active historical tables after archive verification: `financial_ledger`, `financial_discrepancies`, `reconciliation_reports`, `wallet_change_audit_logs`, `job_execution_logs`, `admin_logs`, and `bulk_password_reset_runs`.
- Other `common_temporary_password_reset_runs` rows, except the named completed `FULL_REPLACEMENT` run.
- The three non-selected Admin rows, after their dependent rows are removed.

The Master wallet and Master wallet-address rows are preserved; only the Master wallet balances, tree fields, BV counters, referral counters, `referredBy`, and salary-business counters are reset. The selected Super Admin row, completed FULL_REPLACEMENT run, `system_settings`, `company_wallets`, `withdrawal_settings`, `salary_rank_config`, and `_prisma_migrations` are preserved. Foreign keys remain enabled; deletions are child-first and never use `CASCADE`. Ordinary users’ `fullReplacementPasswordResetRunId` references are explicitly cleared before non-preserved reset-run rows are deleted; the Master is asserted to reference only NULL or the preserved run.

`admin_logs` are cleared from the active database after archive verification. Any legally required log history must remain in the approved restricted archive.

`bulk_password_reset_runs` references private object-storage credential artifacts. Deleting its rows alone would leave those objects behind; all referenced paths must be individually reconciled and the objects confirmed absent or deleted first.

## Expected final counts

- `users`: 1 (the protected Master); `admins`: 1 (the selected active Super Admin); `wallets`: 1 (Master).
- `salary_business_summary`: 1 (Master, with direct/downline/power business counters zero).
- `common_temporary_password_reset_runs`: exactly 1 (the named completed FULL_REPLACEMENT row); `bulk_password_reset_runs`: 0.
- Every table in the first three delete-scope bullets above: 0 rows, including `manual_deposit_idempotency`; no ordinary-member reset tokens, notifications, wallet addresses, or salary summaries.
- Master wallet-address and notification/reset-token rows are preserved if present; their exact pre-reset values are not printed or changed.
- The owner-reported `_prisma_migrations` counts remain 40 total / 39 successful, with latest successful migration `20260924000000_full_replacement_password_ownership`. All protected config row contents are compared transactionally and their row counts should remain unchanged.

## Required isolated restore test

Do not point this command at Production. Restore the verified backup to a dedicated isolated database whose name starts with `v1_reset_test_` and is not `neondb`. The reset SQL refuses every other database before it locks any table. Use the owner’s locally secured database configuration and keep the populated CSVs and SQL in a private working directory.

First inspect the custom-format backup without connecting to a database:

```bash
pg_restore --list "$V1_VERIFIED_BACKUP" > "$V1_PRIVATE_BACKUP_LIST"
```

Create an empty database on a dedicated local/isolated PostgreSQL instance, not the Production cluster. Set `V1_RESET_TEST_DATABASE_NAME` to a unique `v1_reset_test_*` name and verify the connection target before restoring:

```bash
case "$V1_RESET_TEST_DATABASE_NAME" in
  v1_reset_test_*) ;;
  *) echo "Refusing non-test database name" >&2; exit 1 ;;
esac
test "$V1_RESET_TEST_DATABASE_NAME" != "neondb"
test "$(psql "$V1_RESET_TEST_DATABASE_URL" -XAt -v ON_ERROR_STOP=1 \
  -c 'SELECT current_database()')" = "$V1_RESET_TEST_DATABASE_NAME"
```

Restore the verified dump to that isolated database only:

```bash
pg_restore --single-transaction --exit-on-error --no-owner --no-privileges \
  --dbname="$V1_RESET_TEST_DATABASE_URL" \
  "$V1_VERIFIED_BACKUP"
```

Keep the backup, restore output, and both populated CSV manifests outside the repository. Do not use `--clean` or `--create`.

After confirming the restored target identity, run the complete guarded transaction:

```bash
psql "$V1_RESET_TEST_DATABASE_URL" \
  -X -v ON_ERROR_STOP=1 \
  -v expected_database="$V1_RESET_TEST_DATABASE_NAME" \
  -v expected_role="$V1_RESET_TEST_DATABASE_ROLE" \
  -v archive_verified=YES \
  -v financial_clearance_verified=YES \
  -v commit_approved=YES \
  -f ./phase-0c-3-final-reset.sql
```

Use `commit_approved=YES` only for the isolated restored copy during the test. The CSV manifests must be present beside the script in the current working directory. Review every statement and output; the script should commit on the isolated clone only when all gates and assertions pass.

Then run the read-only validation against that same isolated clone:

```bash
psql "$V1_RESET_TEST_DATABASE_URL" \
  -X -v ON_ERROR_STOP=1 \
  -v expected_database="$V1_RESET_TEST_DATABASE_NAME" \
  -v expected_role="$V1_RESET_TEST_DATABASE_ROLE" \
  -f ./phase-0c-3-post-reset-validation.sql
```

Confirm it reports one Master, one selected Super Admin, no ordinary members, zero operational/Treasury-history rows in the active database, the unchanged completed reset run and migration aggregates, zero orphans, and zero Master balances/counters. Independently verify that the original restored archive remains intact.

## Failure behavior

Any failed `ON_ERROR_STOP`, missing CSV, stale count, mismatch, archive/clearance gate failure, unexpected FK/trigger, or assertion error must abort the current transaction. The connection closing rolls back the transaction. Do not retry after an error until the cause is reviewed and the preflight is refreshed. Do not disable constraints, use cascade, or convert a historical status to make the gate pass.

## Production boundary and restart caveat

This task does not authorize a Production reset. The Production execution command is intentionally withheld until the isolated restore test passes, evidence gates are independently verified, the SQL is reviewed, and the owner gives separate execution approval.

The current workspace contains `20261114010000_single_plan_foundation`, which Production does not have. Candidate checkpoint `c600ec321eee9683aea3da059fbf288f797ae5ba` omits that migration, but its `build:prod` still runs `prisma migrate deploy`. Compare every migration name/status to Production and verify the selected restart source before any future publish. No publish, restart, or migration is part of this runbook.
