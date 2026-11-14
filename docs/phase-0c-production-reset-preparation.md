# PrimeWave V1 Phase 0C — Production reset preparation

**Status: Phase 0C.1 preparation complete; reset is blocked and was not run.**

This report covers the V1 Production deployment and its Replit Production read-only database view. No Production data, deployment settings, workers, or financial-engine code were changed. No deployment was published, stopped, restarted, or probed over HTTP.

## Production connectivity and availability

- Deployment metadata reports a **public Autoscale deployment** with a successful build. That metadata does not establish that a process is currently serving requests.
- Recent Production telemetry shows repeated Prisma errors, `Can't reach database server at [REDACTED_DB_HOST]:5432`, followed by an unhandled Prisma rejection and API artifact crash loops. The same error recurred at 00:58, 01:04, 01:09, and 01:15 UTC on 2026-11-14. At 01:15:30 UTC, logs said all artifact processes had stopped. Generic `/` and `/api` health checks returned HTTP 500 around 01:09.
- This points most strongly to database endpoint/network/provider reachability. The logs do not distinguish a transient provider/network fault from an endpoint or deployment-network issue. They do not establish that credentials or pool exhaustion caused the incident.
- A **read-only query to Replit’s Production database view succeeded** and returned `neondb` metadata and counts below. This proves that read-only Production metadata was available through that channel at query time; it does **not** prove that the deployed API could reach its primary database endpoint. No direct application connection or write was attempted.
- The latest runtime evidence available ends at 01:19:15 UTC. It does not prove the current process state. Autoscale can start again on a later request, so the last “all processes stopped” message is not a guarantee that Production is now quiescent.
- The `/api` health handler responds without checking the database. Its HTTP status is not a database-readiness signal.

## Read-only Production inventory

The following are aggregate counts from the earlier read-only snapshot. **They were not refreshed for Phase 0C.1**; the correction requires a separately approved final preflight before changing any expected counts. No usernames, email addresses, password hashes, wallet balances, private keys, or credential values were read.

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
| Immutable financial ledger rows | 625 |
| Referral history rows | 6,688 |
| Income transfers / release rows | 84 / 7,998 |
| Transfers with a positive remaining amount | 3 |
| Deposit verifications apparently unfinished by timestamp/error fields | 0 |
| Admin logs | 1,199 |
| System settings | 48 |
| Prisma migration-history rows | 40 |
| Single-plan account/event tables | Absent from Production |

The owner confirms that the 10 pending withdrawals, one manual-review withdrawal, and three transfers with remaining amounts were settled externally. This is recorded as an owner attestation only; no settlement evidence has been supplied or independently checked. The Production rows still carry their historical statuses and remaining amounts. **No database status was marked completed, and none of these records were changed.** The reset candidate keeps its guards and now requires a one-to-one external evidence manifest matched to the historical row before it will proceed.

The current Production schema is not the same as the current Development Prisma schema: the repository contains the Phase 1B `20261114010000_single_plan_foundation` migration, while Production has no `single_plan_accounts` or `single_plan_events` table. The Production history still includes the completed `20260924000000_full_replacement_password_ownership` migration. All 40 `_prisma_migrations` rows, including any rolled-back history, must be retained unchanged.

## Foreign-key and preservation plan

The live Production foreign-key inventory was read from PostgreSQL catalogs; the important deletion constraints are:

- `users.sponsorId` and `users.binaryParentId` are self-referencing `NO ACTION` constraints. Clear those links before deleting member rows, including any Master links into the old tree.
- Operational tables selected for reset have restrictive user/investment/parent references. Delete only explicitly approved, non-audit rows child-first, without `CASCADE`; preserved audit/event references must stop the reset rather than be deleted or cascaded.
- `wallets` and `wallet_addresses` reference users. Preserve the Master wallet and wallet addresses; delete ordinary members’ wallet rows explicitly after wallet transactions are cleared.
- `admin_logs.targetUserId` uses `ON DELETE SET NULL`. Retain all admin-log rows and details; the target reference will become null only for deleted ordinary users. `admin_logs.adminId` is restrictive, so keep all four Admin rows.
- The completed reset-run records are in `common_temporary_password_reset_runs`; they and `bulk_password_reset_runs` have admin references and historical scalar user IDs. The candidate preserves both tables without updates or deletes, including the completed FULL_REPLACEMENT record.
- Preserve `admins`, `admin_logs`, both reset-run tables, protected configuration, `_prisma_migrations`, reconciliation/discrepancy records, and all identified immutable or append-only audit/event histories. These include `financial_ledger`, `bv_history`, `power_bv_ledger`, `salary_business_event`, `salary_payout_event`, `salary_run_audit`, `wallet_change_audit_logs`, withdrawal events, deposit verifications, and transfer releases.
- These preserved rows can contain member IDs, usernames, transaction details, old/new wallet addresses, or financial snapshots. `admin_logs.targetUserId` alone is expected to become null under its existing FK action for deleted users; the log details remain unchanged.
- Prisma explicitly documents several ledger/event tables as immutable or never-delete. The candidate no longer deletes those tables and fails closed if dependent audit/event rows exist. For example, the earlier snapshot showed 7,998 `income_transfer_releases`; this value was not refreshed, but the current candidate will stop if any such release rows exist.
- The current Treasury API reports financial-ledger summaries, counts all `OPEN`/`UNDER_REVIEW` discrepancies, and selects the latest reconciliation report without a reset-date filter. Preserving those rows unchanged could make pre-reset ledger totals, discrepancies, or reports appear current after restart. Do not mark them resolved or delete them to hide this. A separately approved reporting cutoff/reset epoch must be implemented and verified before re-enabling Treasury views.
- Trigger inspection found one non-internal trigger on `company_wallets`: `BEFORE INSERT OR UPDATE OF network`, calling `enforce_company_wallet_bep20_limit()`. The candidate does not write that table, so this trigger should not fire. No non-internal triggers were found on reset-target or `admin_logs` tables. The expected FK side effect is `admin_logs.targetUserId` becoming null for deleted members; other dependent rows are either explicitly deleted child-first or cause the candidate to stop.

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
- Audit retention assessment: `docs/phase-0c-1-audit-retention-assessment.md`
- External settlement checklist: `docs/phase-0c-1-settlement-reconciliation-checklist.md`
- Shutdown/restart runbook: `docs/phase-0c-1-production-shutdown-runbook.md`

The reset candidate has an approval gate set to `NO`, a rollback rather than commit, exact snapshots for the Master identity, admins, protected configuration and audit/event rows, and one-to-one external settlement evidence checks. It does not change withdrawal statuses or delete preserved audit/event rows. It was **not executed**. No settlement manifest has been populated, and the old database statuses remain; the guards therefore still block it.

The post-reset checks assert one Master user and wallet, four Admin rows, zero ordinary users, zero targeted operational rows, zero Master wallet/network values, no remaining member-dependent rows, and no orphaned foreign keys. Immutable audit/event tables are retained and compared with the final preflight, not expected to be zero. Protected row contents are compared inside the reset transaction without printing hashes or configuration values.

## Blockers before any future reset

1. Independently verify evidence for each of the 10 `PENDING` and 1 `MANUAL_REVIEW` withdrawals and 3 positive transfer remainders; the owner’s external-settlement confirmation alone does not populate the manifest. Do not rewrite historical statuses.
2. Independently verify the reported encrypted Production backup and isolated restore test. No artifact, timestamp, size, hash, or restore evidence was available here.
3. Authorize and verify a full Autoscale deployment shutdown. It was not shut down because this task prohibits publishing/unpublishing or worker restarts.
4. Reconcile the API’s Production database connectivity problem before a controlled restart.
5. Keep immutable audit/event records intact. The candidate now stops if their foreign-key dependencies would be removed or cascaded. The earlier snapshot included 7,998 income-transfer release rows; counts need a final preflight.
6. Implement and verify an approved Treasury reporting cutoff so retained ledger totals, discrepancies, and reports are not treated as current after reset.
7. Before any later Production build, choose a checkpoint/release without the pending Phase 1B migration and verify its migration history against the approved final preflight.
8. Refresh the candidate’s expected counts only during a separately approved read-only final preflight against the intended Production primary.

## Actions not taken

No Production rows or schema were modified. No user/password, withdrawal, deposit, wallet, investment, reset-run, migration, audit, or financial state was changed. No backup was created or restored. No credentials were read. No worker or deployment was restarted, stopped, published, or unpublished. No deployment settings were changed, and no expected data counts were refreshed for Phase 0C.1.
