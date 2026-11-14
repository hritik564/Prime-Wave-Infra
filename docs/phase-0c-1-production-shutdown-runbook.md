# PrimeWave V1 Phase 0C.1 — Production shutdown and restart runbook

**Operator runbook only. No shutdown, publish, restart, setting change, or database write was performed.**

Use these steps only after the owner separately approves the outage, the settlement evidence, the backup, and the eventual reset. The reset candidate is still review-only (`NO` approval gate, final `ROLLBACK`); this runbook does not authorize its execution.

## A. Before the outage

1. Confirm the encrypted Production backup, checksum, storage controls, `pg_restore --list`, and isolated restore test. The backup is currently owner-reported, not independently verified.
2. Complete the settlement manifest in `phase-0c-1-settlement-reconciliation-checklist.md`; a general owner attestation is not enough.
3. Approve a maintenance window and unpublish separately. Unpublishing removes the public URL and takes the app offline; it does not delete the project or database.
4. Record the currently published revision/build identifier and preserve the chosen source checkpoint. Do not start a build from the current workspace: its API build command runs `prisma migrate deploy`, and the workspace contains the Phase 1B migration not present in Production.
5. Confirm the audit/reporting reset boundary is ready. The current treasury reads old reconciliation reports and open discrepancies without a reset-time filter.

## B. Stop every writer

1. In Replit, open **Publishing**, select the complete current V1 deployment, choose **Unpublish** or **Shut down**, and confirm only after the separate outage approval. This is the documented way to prevent Autoscale requests from waking the deployment; merely waiting for idle scale-to-zero is not sufficient. If the UI exposes PrimeWave Platform and API Server as separate public services, stop both; the API serves the website and must not remain reachable on its own.
2. Verify through Publishing/deployment metadata that the deployment is unpublished/stopped (`isDeployed` is false) and use deployment logs to confirm the API and all artifact processes stopped. Do not curl or visit the old URL as a “health check”; a live Autoscale URL can wake application startup.
3. Inventory and stop every non-Replit writer independently: external scripts, scheduled jobs, CI tasks, alternate API deployments, direct database clients, and payment/reconciliation workers. The Replit deployment state alone cannot rule these out.
4. Have the authorized database operator connect securely to the actual Production primary—not the Replit read-only replica—and check for remaining client sessions. Example metadata-only query:

   ```sql
   SELECT
     usename,
     application_name,
     state,
     count(*) AS sessions,
     count(*) FILTER (WHERE xact_start IS NOT NULL) AS open_transactions
   FROM pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND backend_type = 'client backend'
   GROUP BY usename, application_name, state
   ORDER BY usename, application_name, state;
   ```

   The database operator must identify every application/writer role and confirm there are no remaining writer sessions or open write transactions. If the role lacks enough visibility, or any session is unexplained, stop here.

## C. Final read-only preflight

1. Obtain separate approval for the final preflight. Run it against the actual Production primary using the owner’s secure access method. `executeSql({environment:"production"})` is a read-only replica and does not prove primary writer quiescence.
2. Reconfirm the database identity, all live tables, columns, foreign keys, triggers, Master identity fields, four Admin rows, protected configuration, migration rows, open withdrawal/transfer obligations, reset-run states, and immutable audit/event references. Do not print credentials, password hashes, full wallet addresses, or unnecessary member data.
3. Refresh the candidate’s expected row counts only from this approved preflight. Keep a signed preflight result with the backup/evidence manifest.
4. Require the evidence manifest to match every nonterminal withdrawal and every positive transfer remainder exactly once, including historical DB status and externally verified amount/currency/reference. Never update the old rows to `COMPLETED` merely to make the guard pass.
5. Do not run the reset unless a separate explicit reset approval is given. The current candidate has no COMMIT version and must remain that way for this task.

## D. Prevent an unsafe migration or startup

1. Do **not** click Publish on the current workspace. Its `build:prod` runs `prisma migrate deploy`; the current source includes `20261114010000_single_plan_foundation`.
2. Replit does not offer a direct “redeploy the old published build” rollback. Its documented recovery path is to roll the project back to a selected checkpoint in the Project Editor and then Publish that source. A checkpoint rollback changes project code and requires separate approval.
3. Before any future Publish, select and review a V1 checkpoint/release that contains no migration absent from the approved Production migration history. Check both the migration files and the artifact build command; if no migration-safe release can be demonstrated, keep the app unpublished.
4. Before first startup, the owner must confirm that these startup controls are absent/disabled in the Production environment: `ADMIN_RESET_PASSWORD`, `GENERATE_NETWORK`, `FUND_NETWORK`, `RESET_FOR_LAUNCH`, and `SEED_ON_START`. Do not display secret values. Also verify the one-time orbit-income backfill is already completed and no common password-reset run will resume unexpectedly.
5. `startScheduler`, withdrawal recovery/confirmation, deposit verification, integrity scanning, and withdrawal auto-processing start in Production code. They will begin writing as soon as the approved app starts. `MAINTENANCE_MODE` does not block `/api` routes or stop those workers.

## E. Restore service only after validation

1. Keep the deployment unpublished until the approved reset transaction, its in-transaction assertions, the read-only post-reset validation, and external settlement/backup evidence checks all pass.
2. Separately authorize the migration-safe source checkpoint and Publish. Do not bypass a migration or accept a destructive schema diff in the UI.
3. Confirm the Production database is reachable from the intended application network using an owner-controlled, read-only connection check. The current `/api` health endpoint does not check database connectivity.
4. After Publish, inspect build/deployment logs for successful startup, the intended schema/migration state, the expected single Master/four Admins, and worker startup. Do not treat `getDeploymentInfo` success or `/api` health alone as database readiness.
5. Only after these checks should public traffic and normal financial operations resume. If the migration list, connection state, startup flags, or worker state differs from the approved plan, keep the deployment stopped and investigate.

## Current blockers

- No independent settlement receipts or signed manifest have been provided.
- The backup artifact and isolated restore evidence have not been inspected.
- Production API logs show database reachability errors; primary connectivity remains unverified.
- No shutdown or external-writer-session verification has been performed.
- Append-only audit/event rows must remain intact; the current candidate blocks if retained events still reference records it would otherwise remove. The earlier snapshot included 7,998 income-transfer releases.
- Retained treasury audit rows need a reporting reset boundary before the old dashboard can safely be shown as current.
- The current workspace is not a migration-safe source for a Production restart.
