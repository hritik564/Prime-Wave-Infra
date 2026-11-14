# PrimeWave V1 Phase 0C.3 — Reset preparation status

**Reset SQL drafted with fail-closed gates. Not tested on an isolated restore and not ready for Production execution.**

## Owner-confirmed targets

- Master: `pwmaster0000000000000001`.
- Sole surviving Admin: `6f67dde8-f7c6-4fff-8042-b28dd50191d7` (`SUPER_ADMIN`, active).
- The other three Admin IDs/roles/statuses were confirmed from the owner-side read-only query and are guarded in the SQL.
- Completed run `cmuaw52yf004vj1h61tpbr14w` is owned by the selected Super Admin; it is snapshotted and compared inside the transaction.
- Owner preflight reports 6,689 users, four Admins, no Single Plan tables, no user-defined triggers on inspected tables, 40 migration records/39 successful, and latest successful migration `20260924000000_full_replacement_password_ownership`.

## Prepared files

- `docs/phase-0c-3-final-reset.sql` — explicit target IDs and roles; archive, private credential-artifact, and owner-approved financial-clearance CSV gates; exact snapshots for Master identity/authentication, selected Admin, completed FULL_REPLACEMENT run, protected configuration, and Prisma migration history; ordered child-first deletes; zero-state, protected-state, and orphan assertions; commit gate defaults to `NO`.
- `docs/phase-0c-3-post-reset-validation.sql` — separate read-only checks for the expected one-Master/one-Super-Admin state, empty operational/Treasury history, retained reset run, migration aggregates, and foreign-key orphans.
- `docs/phase-0c-3-execution-runbook.md` — conditional scope, owner-side isolated restore test commands, rollback behavior, and Production/restart boundary.
- `docs/phase-0c-3-financial-clearance-manifest.csv` and `docs/phase-0c-3-archive-manifest.csv` — empty header templates only; no disposition or archive data was fabricated.

## Still required before Production execution

1. Obtain an owner-approved, independently reviewed disposition for all 14 unresolved records: 11 nonterminal withdrawals and 3 positive transfer remainders. The script rechecks the exact statuses, counts, and amounts but does not pay, release, cancel, or alter those records. The 3 income transfers are internal 72-hour credits to withdrawal wallets, not external payouts.
2. Independently verify a fresh (24-hours maximum) encrypted/restricted backup, `pg_restore --list`, isolated restore, row-count reconciliation, access controls, and retention approval. The project still has no uploaded verification evidence. SQL flags do not prove a backup is valid.
3. Inventory every `bulk_password_reset_runs.artifactObjectPath` against private object storage and confirm every referenced credential artifact is absent or securely deleted. The reset clears the database metadata but cannot delete external objects itself; those objects must not be retained with the financial archive.
4. Run the reset on a dedicated isolated restored database and run the post-reset validation there. This was not possible from the available workspace; no database was connected to or changed.
5. Compare every Production migration name/status to the candidate restart source. The candidate pre-Single-Plan checkpoint omits the migration absent in Production, but `build:prod` still runs `prisma migrate deploy`; restart compatibility is not certified.
6. Obtain separate owner approval after the isolated test and SQL review. The SQL’s commit gate is disabled by default. No Production execution command is issued at this stage.

## Outcome

The selected Super Admin and completed reset-run dependency are now resolved. The SQL is prepared for independent review and isolated testing, but it is not safe to recommend or execute against Production until the four prerequisites above pass. No Production or Development SQL was executed; no records, workers, deployments, settings, or migrations were changed.
