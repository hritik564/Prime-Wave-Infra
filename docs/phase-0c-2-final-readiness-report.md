# PrimeWave V1 Phase 0C.2 — Final reset readiness

**Decision: NOT READY for a Production reset. No executable reset SQL was generated.**

## Completed checks

- Reviewed the owner-provided Production preflight result. It reports a read-only transaction against `neondb` as `neondb_owner`.
- Confirmed counts: 6,689 users (1 Master, 6,688 ordinary members), 4 Admins.
- Confirmed the Production inventory shows no Single Plan tables and no user-defined triggers on the inspected tables.
- Confirmed migration aggregates: 40 records, 39 successful, latest successful migration `20260924000000_full_replacement_password_ownership`.
- Reviewed the Production foreign-key inventory and identified child-first dependencies without disabling constraints.
- Reviewed the current Treasury query paths and production build command. The Treasury UI consumes old ledger rows, open discrepancies, and the latest reconciliation report. `build:prod` runs `prisma migrate deploy`.
- Created the read-only validation SQL and a blocked execution runbook.

## Unresolved blockers

### Settlement evidence

The owner preflight reports 11 nonterminal withdrawals (10 `PENDING`, 1 `MANUAL_REVIEW`) and 3 positive transfer remainders totaling `2.76013842`. The owner has stated these were externally settled, but the workspace contains no matching per-record evidence or independent review. A backup does not settle an obligation. No reset script may remove these rows until the exact 14 records are reconciled and independently reviewed.

### Historical retention and Treasury

The latest project record says the encrypted backup and isolated restore test were not independently verified. The supplied preflight result does not include backup checksum/listing/restore evidence, current audit-table row counts, or a signed archive manifest. The legal retention period and approved archive location are also absent.

Keeping old `financial_ledger`, `financial_discrepancies`, or `reconciliation_reports` in live tables would make old history appear current in the existing Treasury API. Removing them from live tables without a verified restricted archive would violate the evidence-retention requirement. No safe choice is established yet.

### Migration-safe restart

Candidate checkpoint `c600ec321eee9683aea3da059fbf288f797ae5ba` predates the Single Plan migration and contains 39 migration directories through the Production’s latest successful migration. It is not certified for restart: `build:prod` still runs `prisma migrate deploy`, and the owner preflight does not provide the full Production migration-name/status set needed to prove exact equality. The current workspace must not be published for this reset because it includes `20261114010000_single_plan_foundation`.

## Proposed protected state and scope

Expected protected state: the original Master row and wallet identity, all four Admin rows/credentials/roles/statuses, approved system configuration, and every existing `_prisma_migrations` row. The completed `FULL_REPLACEMENT` record remains untouched.

The reset scope would cover ordinary-member wallets, wallet addresses, investments, ROI, deposits, withdrawals, transfer schedules/releases, referral and level-income records, binary/BV records, salary business/income records, notifications, member-targeted sessions/tokens, and operational Treasury history that is archived and removed from live reporting. Audit/event rows with restrictive FKs must be archived and explicitly removed child-first only under an approved retention plan. `admin_logs` are retained; the existing FK sets deleted members’ `targetUserId` to NULL.

This is a proposed scope, not a finalized deletion list. The final table set depends on the approved archive design and complete final preflight.

Proposed active-table removal set after those gates: `wallet_transactions`, `investments`, `roi_ledger`, `deposit_verifications`, `deposit_requests`, `withdrawal_events`, `withdrawal_requests`, `income_transfer_releases`, `income_transfers`, `manual_deposit_idempotency`, `referral_history`, `level_income`, `match_bv_ledger`, `orbit_bv_ledger`, `salary_bv_ledger`, `bv_history`, `binary_match_income`, `binary_orbit_income`, `power_bv_ledger`, `salary_achievement`, `salary_business_event`, `salary_payout_event`, `salary_income`, `salary_run_audit`, and `salary_run`; plus ordinary-member rows from `password_reset_tokens`, `impersonation_sessions`, `notifications`, `wallet_addresses`, `salary_business_summary`, and `wallets`, followed by ordinary `users`. `financial_ledger`, `financial_discrepancies`, and `reconciliation_reports` must also be archived and cleared from live reporting or a separately approved reporting cutoff must be implemented. This list is conditional and is not an executable deletion plan.

## Files

- Created: `docs/phase-0c-2-post-reset-validation.sql` — read-only checks for the expected state; it cannot prove an external archive or compare full protected-row contents without a pre-reset baseline.
- Created: `docs/phase-0c-2-reset-execution-runbook.md` — blocker, archive/dependency approach, and future failure procedure.
- Created: `docs/phase-0c-2-final-readiness-report.md` — this status report.
- Not created: `docs/phase-0c-2-final-reset.sql` — withheld because settlement and archive prerequisites are not verified.

## Smallest next action

Provide (1) a redacted, independently reviewed settlement manifest for the 11 withdrawals and 3 transfer remainders, and (2) the backup/archive verification package: checksum, `pg_restore --list` result, isolated restore outcome, protected-access details, and approved retention period. Do not include credentials or connection strings. Then capture the full migration-name/status comparison and the final table-count baseline before the reset design is finalized.

**No Production SQL was executed. No data, migration, deployment, worker, or environment setting was changed. This work does not authorize execution.**
