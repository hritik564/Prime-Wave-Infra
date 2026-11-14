# PrimeWave V1 Phase 0C — Production reset preparation

**Status: read-only preparation complete; reset is blocked and was not run.**

This report covers the V1 Production deployment and its Replit Production read-only database view. No Production data, deployment settings, workers, or financial-engine code were changed. No deployment was published, stopped, restarted, or probed over HTTP.

## Production connectivity and availability

- Deployment metadata reports a **public Autoscale deployment** with a successful build. That metadata does not establish that a process is currently serving requests.
- Recent Production telemetry shows repeated Prisma errors, `Can't reach database server at [REDACTED_DB_HOST]:5432`, followed by an unhandled Prisma rejection and API artifact crash loops. The same error recurred at 00:58, 01:04, 01:09, and 01:15 UTC on 2026-11-14. At 01:15:30 UTC, logs said all artifact processes had stopped. Generic `/` and `/api` health checks returned HTTP 500 around 01:09.
- This points most strongly to database endpoint/network/provider reachability. The logs do not distinguish a transient provider/network fault from an endpoint or deployment-network issue. They do not establish that credentials or pool exhaustion caused the incident.
- A **read-only query to Replit’s Production database view succeeded** and returned `neondb` metadata and counts below. This proves that read-only Production metadata was available through that channel at query time; it does **not** prove that the deployed API could reach its primary database endpoint. No direct application connection or write was attempted.
- The latest runtime evidence available ends at 01:19:15 UTC. It does not prove the current process state. Autoscale can start again on a later request, so the last “all processes stopped” message is not a guarantee that Production is now quiescent.
- The `/api` health handler responds without checking the database. Its HTTP status is not a database-readiness signal.

## Read-only Production inventory

The following are aggregate counts only; no usernames, email addresses, password hashes, wallet balances, private keys, or credential values were read.

| Production item | Observed |
|---|---:|
| Users | 6,689, including exactly 1 username matching `master` |
| Admin rows | 4 |
| User wallets | 6,689 |
| Investments | 211 |
| ROI ledger rows | 32,415 |
| Deposit requests | 222, all `APPROVED` |
| Withdrawal requests | 157 |
| Withdrawal statuses | 10 `PENDING`, 1 `MANUAL_REVIEW`, 102 `COMPLETED`, 15 `FAILED`, 29 `REJECTED` |
| Wallet transactions | 10,076 |
| Financial ledger rows | 625 |
| Referral history rows | 6,688 |
| Income transfers / release rows | 84 / 7,998 |
| Transfers with a positive remaining amount | 3 |
| Deposit verifications apparently unfinished by timestamp/error fields | 0 |
| Admin logs | 1,199 |
| System settings | 48 |
| Prisma migration-history rows | 40 |
| Single-plan account/event tables | Absent from Production |

Three transfers still have an unreleased amount. The withdrawal queue has eleven nonterminal or manual-review records. **Neither these withdrawals nor these transfers were changed.** They are blockers to a safe reset until the authorized owner reconciles them or explicitly decides their disposition.

The current Production schema is not the same as the current Development Prisma schema: the repository contains the Phase 1B `20261114010000_single_plan_foundation` migration, while Production has no `single_plan_accounts` or `single_plan_events` table. The Production history still includes the completed `20260924000000_full_replacement_password_ownership` migration. All 40 `_prisma_migrations` rows, including any rolled-back history, must be retained unchanged.

## Foreign-key and preservation plan

The live Production foreign-key inventory was read from `information_schema`; the important deletion constraints are:

- `users.sponsorId` and `users.binaryParentId` are self-referencing `NO ACTION` constraints. Clear those links before deleting member rows, including any Master links into the old tree.
- Investments, ROI/BV ledgers, level income, referral history, binary income, salary records, deposits, withdrawals, transfers, and wallet transactions have restrictive user/investment/parent references. Delete the dependent rows explicitly, child-first, without `CASCADE`.
- `wallets` and `wallet_addresses` reference users. Preserve the Master wallet and wallet addresses; delete ordinary members’ wallet rows explicitly after wallet transactions are cleared.
- `admin_logs.targetUserId` uses `ON DELETE SET NULL`. Retain all admin-log rows and details; the target reference will become null only for deleted ordinary users. `admin_logs.adminId` is restrictive, so keep all four Admin rows.
- The completed reset-run records are in `common_temporary_password_reset_runs`; they and `bulk_password_reset_runs` have admin references and historical scalar user IDs. The candidate preserves both tables without updates or deletes, including the completed FULL_REPLACEMENT record.
- Keep `admins`, `admin_logs`, both reset-run tables, `system_settings`, `salary_rank_config`, `withdrawal_settings`, `company_wallets`, `_prisma_migrations`, and the identified system/audit tables.
- Delete financial/operational tables explicitly: wallet transactions, investments, ROI/BV/income ledgers, referral history, deposits/verifications, withdrawals/events, income transfers/releases, financial ledger entries, and manual-deposit idempotency rows.
- `financial_discrepancies`, `reconciliation_reports`, `wallet_change_audit_logs`, and reset/job audit metadata have no foreign key to the user rows. The conservative draft preserves these audit records. They can still contain old user IDs, usernames, or financial snapshots in text/JSON; preserving them means those historical references remain even though their users are removed. If the intended reset also requires erasing those audit contents, that is a separate retention decision and must be settled before execution.

The Master user row remains with the same ID and identity/credential fields. The draft only clears network links/counters and resets the Master wallet and salary business summary to zero; it does not update password hashes, email, username, auth version, or the Admin table.

## Writers and shutdown plan

Production write paths include:

- HTTP writes under `/api/auth`, `/api/users`, `/api/wallets`, `/api/wallet-addresses`, `/api/investments`, `/api/binary`, `/api/level-income`, `/api/salary`, `/api/deposits`, `/api/withdrawals`, `/api/notifications`, `/api/income`, `/api/network`, `/api/deposit-verifications`, `/api/referrals`, `/api/dev`, `/api/seed`, and the many `/api/admin` actions. Admin actions include financial-cycle triggers, settings, member/deposit/withdrawal operations, salary runs, seed/repair scripts, and treasury reconciliation.
- Production startup writers: optional admin-password reset, network generation/funding, `RESET_FOR_LAUNCH`, seed-on-start, withdrawal recovery, common temporary-reset recovery, a one-time orbit-income backfill, scheduler startup, ledger-integrity scheduling, deposit verification, and withdrawal auto-processing.
- The scheduler runs ROI, binary matching/orbit, hourly income-transfer releases, and a withdrawal-confirmation poller. Deposit verification and withdrawal workers also write state and can call the BSC network.
- External financial interactions include BSC RPC verification and withdrawal signing/broadcast via the configured hot wallet. Secret values were not accessed.

`MAINTENANCE_MODE` is not a writer shutdown: in the inspected app, `/api` is mounted before `maintenanceWebGate`, and that gate does not stop startup workers. The API server’s health endpoint also does not check the database.

Replit’s Autoscale documentation says idle apps can scale to zero and wake automatically on a request; individual replicas cannot be manually paused. The documented way to stop the entire live deployment is through Publishing shutdown/unpublish. **That action is prohibited by this request and was not taken.** A safe reset therefore still needs a separately authorized full-deployment shutdown and verification that every Production process is stopped. Do not rely on maintenance mode or idle scale-to-zero.

There is an additional release gate: the Production build command runs `prisma migrate deploy`. Building/publishing from the current workspace could apply the Development-only Phase 1B migration to Production. No publish/build was performed. A safe post-reset restart path cannot be certified until a release plan prevents an unapproved migration and confirms all startup writer switches are disabled.

## Candidate SQL and validation

- Review-only transaction: `docs/phase-0c-production-reset-candidate.sql`
- Read-only post-reset checks: `docs/phase-0c-post-reset-validation.sql`

The reset candidate has an approval gate set to `NO`, a rollback rather than commit, exact snapshot guards, and fail-closed checks for outstanding withdrawals and transfers. It was **not executed**. At the observed state, those guards would stop it because 11 withdrawals are unresolved and 3 transfers still have remaining amounts.

The post-reset checks expect one Master user and wallet, four Admin rows, zero ordinary users, zero targeted ledger and operational rows, zero Master wallet/network values, unchanged protected-table counts, unchanged migration history, and no orphaned foreign keys. The explicitly retained audit tables may still contain historical member references.

## Blockers before any future reset

1. Resolve the 10 `PENDING` and 1 `MANUAL_REVIEW` withdrawal records through an explicitly authorized, audited process; do not erase or alter them as part of preparation.
2. Reconcile the 3 transfers with a positive remaining amount.
3. Independently verify the reported encrypted Production backup and isolated restore test. The backup was reported as complete outside Replit, but no artifact, timestamp, size, or restore evidence was available here.
4. Authorize and verify a full Autoscale deployment shutdown. It was not shut down because this task prohibits publishing/unpublishing or worker restarts.
5. Reconcile the API’s Production database connectivity problem before a controlled restart.
6. Review the audit-retention choice for non-FK audit tables that may retain identifiers/financial snapshots.
7. Before any later Production build, prevent the current workspace’s pending Phase 1B migration from being applied unintentionally.

## Actions not taken

No Production rows or schema were modified. No user/password, withdrawal, deposit, wallet, investment, reset-run, migration, or financial state was changed. No backup was created or restored. No credentials were read. No workers were restarted/stopped. No deployment settings were changed, and nothing was published or unpublished.
