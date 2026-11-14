# PrimeWave V1 Phase 0C.2 — Reset execution runbook

**Status: BLOCKED. Preparation only. No Production SQL, publish, shutdown, or restart was performed by this work.**

This runbook is not an authorization to reset the database. No destructive execution command is supplied because the settlement and retention gates below are unresolved.

## Owner-side Production inventory received

The owner-provided read-only result reports:

- Database `neondb`, role `neondb_owner`, `transaction_read_only=on`.
- 6,689 users: 1 `master` and 6,688 ordinary members; 4 Admins.
- Production has no `single_plan_accounts`, `single_plan_events`, or `single_plan_cycles`.
- No user-defined triggers on the inspected tables.
- 40 Prisma migration rows, 39 successfully applied; latest successful migration is `20260924000000_full_replacement_password_ownership`.
- 11 nonterminal withdrawals (10 `PENDING`, 1 `MANUAL_REVIEW`).
- 3 income transfers with positive remaining amounts, totaling `2.76013842`.

The owner reported zero other database sessions at the time of the check and an unpublished deployment. These are time-specific owner observations, not checks performed here. Reconfirm every writer is stopped and the database is quiescent immediately before any future reset.

## Why no reset command is included

1. The 11 open withdrawals and 3 positive transfer remainders still need item-level external settlement evidence and independent review. A general owner attestation does not prove the obligations were settled. The database rows must not be relabeled merely to pass a reset gate.
2. The project record still lacks the encrypted backup’s checksum, `pg_restore --list` result, access controls, and isolated restore-test evidence. No legal retention schedule or approved external archive manifest was supplied.
3. The live Treasury API reads `financial_ledger`, counts `OPEN`/`UNDER_REVIEW` discrepancies, selects the latest reconciliation report, and totals wallet rows. Leaving those old rows active would expose pre-reset figures as current. Clearing them from Production is not approved until a verified restricted archive preserves them and the owner approves that retention treatment.
4. The old reset candidate keeps some Treasury history and stops on dependent immutable rows. It is not a final script and must not be run.
5. Candidate source checkpoint `c600ec321eee9683aea3da059fbf288f797ae5ba` predates the Single Plan migration and has 39 migration directories through `20260924000000_full_replacement_password_ownership`. It is only a candidate: its `build:prod` still runs `prisma migrate deploy`, and the preflight output does not include all migration names/statuses for an exact set comparison. No restart compatibility is certified.

## Required gates before a final script can be generated

1. Supply a signed, independently reviewed settlement manifest for the exact 11 withdrawals and 3 transfer remainders from the final preflight. It must match each record ID, historical status and amounts/currency to external evidence. Store evidence in restricted storage; do not put credentials, full wallet addresses, or unnecessary personal information in the manifest.
2. Confirm the archive location, encryption/access controls, retention period, checksum, restore listing, isolated restore test, and row-count reconciliation. Keep the immutable original backup.
3. Approve a retention design. It must preserve all legally required financial/audit records outside the live operational tables, including the child event rows that reference withdrawals, deposits, transfers, users, investments, salary income, and salary runs.
4. Capture an approved final read-only preflight after writers are stopped: counts for all operational and audit tables, exact migration names/statuses, protected configuration baseline, Master identity fingerprint (never print password hashes), and FK/trigger inventory.
5. Compare the Production migration names to the chosen source checkpoint. Do not build/publish from the current workspace, which includes `20261114010000_single_plan_foundation`. The candidate checkpoint’s `build:prod` invokes `prisma migrate deploy`; a no-new-migration result must be verified before restart.
6. Obtain a separate explicit approval of the final reviewed reset SQL before any owner executes it.

## Archive and dependency approach for review

The integrity-preserving option is to retain the complete verified Production backup as an immutable encrypted archive, and independently verify an isolated restore before purging active operational history. A second table/schema inside the live database is not an external archive and would remain exposed to application queries.

If the approved design removes archived rows from the live database, delete children explicitly before parents with foreign keys enabled and without `CASCADE`. The owner inventory shows, among others:

- `income_transfer_releases` references `income_transfers` with `RESTRICT`.
- `withdrawal_events` references `withdrawal_requests` with `CASCADE`; explicitly remove/archive events first rather than relying on cascade.
- `deposit_verifications` references users with `RESTRICT` and deposits with `SET NULL`.
- `wallet_transactions` references users and wallets with `RESTRICT`, and withdrawals with `SET NULL`.
- BV, ROI, referral, level-income, salary, and investment-history tables have restrictive user/investment dependencies.
- `users.sponsorId` and `users.binaryParentId` are self-referencing `NO ACTION`; clear the old tree links before deleting ordinary members.
- Deleting members sets `admin_logs.targetUserId` to NULL under its existing FK. Preserve the original audit rows in the verified archive; do not rewrite their JSON details.

Conditional active-reset table scope, only after archive and settlement approval:

- Delete operational rows from `wallet_transactions`, `roi_ledger`, `investments`, `deposit_verifications`, `deposit_requests`, `withdrawal_events`, `withdrawal_requests`, `income_transfer_releases`, `income_transfers`, `manual_deposit_idempotency`, `referral_history`, `level_income`, `match_bv_ledger`, `orbit_bv_ledger`, `salary_bv_ledger`, `bv_history`, `binary_match_income`, `binary_orbit_income`, `power_bv_ledger`, `salary_achievement`, `salary_business_event`, `salary_payout_event`, `salary_income`, `salary_run_audit`, and `salary_run`.
- Delete only ordinary-member rows from `password_reset_tokens`, `impersonation_sessions` (member target), `notifications`, `wallet_addresses`, `salary_business_summary`, and `wallets`; then delete the ordinary rows from `users`.
- Clear active Treasury history from `financial_ledger`, `financial_discrepancies`, and `reconciliation_reports` only if those complete histories have been placed in the approved external archive and the owner explicitly accepts this live-table purge.
- Keep `admin_logs`, `wallet_change_audit_logs`, `bulk_password_reset_runs`, `common_temporary_password_reset_runs`, `job_execution_logs`, all four Admin rows, configuration tables, and `_prisma_migrations` in Production. The Master wallet, identity, wallet addresses, and salary summary are preserved; reset only the specifically approved Master balances/counters/tree fields.

No row was copied to an archive in this task. No audit row was deleted.

## Expected result after a separately approved reset

- Users: 1 (`master`); ordinary members: 0.
- Admins: 4, with all original identity, credentials, roles, and status preserved.
- Master user and wallet identities retained; wallet balances, salary business counters, tree links, BV counters, and `referredBy` cleared to the approved zero state.
- Member operational tables empty; old Treasury ledger/discrepancy/report rows absent from live current reporting only after archive verification.
- System settings, company wallet configuration, withdrawal settings, salary-rank configuration, and all `_prisma_migrations` rows unchanged.
- Full historical evidence remains in the independently verified restricted archive.

## Failure procedure

When the final script is eventually prepared, it must use `psql` with `ON_ERROR_STOP`, a single explicit transaction, strict database/role/account checks, bounded lock and statement timeouts, and final assertions before commit. Any error or failed assertion must abort the transaction. Do not retry after a failure until the cause is reviewed; confirm the transaction rolled back with the read-only validation and inspect the error. Do not disable foreign keys or use blanket cascade.

No executable reset command is provided at this blocked stage.
