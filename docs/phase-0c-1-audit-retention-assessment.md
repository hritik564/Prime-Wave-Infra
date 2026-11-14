# PrimeWave V1 Phase 0C.1 — Audit retention assessment

**Read-only assessment. No audit rows were deleted or modified.**

## Inventory

Counts below are from the earlier read-only Production snapshot and were **not refreshed** for this correction. Use a separately approved final preflight for current counts. Some rows can contain member IDs, names, transaction details, status history, or snapshots; keep the evidence restricted.

| Preserved table/group | Earlier snapshot | Historical content and risk |
|---|---:|---|
| `admin_logs` | 1,199 | Admin actor IDs, target user IDs, action names, timestamps, and JSON details. Deleting a member sets only `targetUserId` to `NULL`; details can still retain historical identifiers. |
| `financial_ledger` | 625 | Prisma documents this as immutable append-only history that must never be edited or deleted. It includes member IDs/usernames, transaction references/types, amounts, opening/closing balances, optional chain/withdrawal/investment references, and metadata. |
| `bv_history`, `salary_bv_ledger` | Not refreshed | Investor/user/investment IDs, BV amounts, side, depth, and timestamps. These user/investment foreign keys can block member deletion. |
| `power_bv_ledger` | Not refreshed | User/Admin IDs, operation, BV amount, before/after balances, reason, and metadata. Prisma explicitly says immutable and never-delete. |
| `salary_business_event` | Not refreshed | User/source-user IDs, pool, event type, delta, reference, depth, and metadata. Prisma explicitly says never update/delete; foreign keys can block member deletion. |
| `salary_payout_event`, `salary_run_audit` | Not refreshed; `salary_run_audit` was 0 in the earlier snapshot | User/run IDs, transition type, performer, timestamps, and JSON metadata. These are documented immutable audit trails. |
| `withdrawal_events` | Not refreshed | Withdrawal ID, event type, time, and JSON details; Prisma describes this as an append-only full audit timeline. Do not cascade-delete it with a request. |
| `deposit_verifications` | Not refreshed | Transaction hash, network, sender/recipient addresses, amount, confirmations, status, and timestamps; Prisma describes this as blockchain audit evidence. |
| `income_transfer_releases` | 7,998 | One row per hourly release, with transfer reference, release number, amount, and time. Retain it; deleting a parent transfer would destroy or conflict with its historical release evidence. |
| `financial_discrepancies` | 54 | Type/severity/description, status, resolution/reviewer fields, timestamps, and JSON metadata that may include historical member IDs or financial snapshots. Open rows may be mistaken for current problems if the dashboard counts them without a reset boundary. |
| `reconciliation_reports` | 36 | Prior reconciliation totals/results and report metadata. The current Treasury dashboard selects the latest report, so the newest pre-reset report can appear to describe post-reset balances. |
| `wallet_change_audit_logs` | 12 | Historical user IDs/usernames and old/new wallet snapshots. These can expose wallet identifiers and should remain restricted. |
| `bulk_password_reset_runs` | 1 | Run-level reset history and scalar member references. Preserve unchanged. |
| `common_temporary_password_reset_runs` | 2 | Run-level password-reset history, including the completed FULL_REPLACEMENT run. Preserve unchanged; do not resume or edit it during this task. |
| `job_execution_logs` | 0 | System execution history; preserve if rows exist at final preflight. |
| `salary_run`, `salary_run_audit` | 0 / 0 | Salary calculation history and details; preserve if rows exist at final preflight. |
| `_prisma_migrations` | 40 | Applied/rolled-back schema history. Preserve all rows and contents. |
| `system_settings`, `salary_rank_config`, `withdrawal_settings`, `company_wallets` | 48 system settings; other counts not refreshed here | Protected operational configuration. The candidate snapshots and compares every row rather than relying on counts. |

The reset candidate retains these tables. It snapshots full rows inside the transaction and compares them before the rollback/possible separately approved execution. It no longer deletes append-only audit/event tables and blocks if a dependent event row would otherwise be deleted directly or by cascade. For admin logs only, the comparison expects the existing FK behavior that nulls `targetUserId` for deleted members; IDs/details in the JSON are not rewritten.

## Financial transaction history versus audit metadata

The reset draft still targets other operational financial history such as wallet transactions, investments, ROI/income data, deposits, withdrawals, and transfers. These can contain transaction details and user references; the full Production backup must preserve them before any separately approved reset. The owner-reported backup has not been independently inspected or restored in this task. If the owner requires any of these histories to remain queryable in Production, the reset candidate must be redesigned rather than treating them as disposable operational state.

## Risk of showing pre-reset evidence as current

The Treasury API currently reports financial-ledger summaries, counts all `OPEN`/`UNDER_REVIEW` financial discrepancies, and selects the latest reconciliation report without filtering by a reset boundary. Preserving those audit rows unchanged can therefore make old ledger totals, discrepancy counts, or reports appear current after the site restarts. Clearing wallet balances does not make an older snapshot describe the new state.

## Recommended retention and display approach

1. Preserve the original full database backup in encrypted, restricted, externally stored, independently restorable form. Keep its checksum and restore-test evidence with the signed settlement manifest.
2. Keep retained audit rows immutable. Do not delete discrepancies/reports to hide stale warnings, change their status to resolved, rewrite their snapshots, or modify reset/migration history.
3. Before re-enabling Treasury views, add a separately approved reporting epoch/cutoff and apply it consistently to financial-ledger summaries, current-balance summaries, discrepancy counts, “latest report” selection, alerts, and exports. Historical rows before the epoch should be clearly labeled and exposed only as historical evidence, not current balances.
4. Keep pre-reset details available only through restricted historical access. Do not merge archived totals into the new Master wallet or new operational balances.
5. Verify the cutoff with tests containing both pre-reset and post-reset rows before restoring public access.

No reporting code, database record, deployment setting, or retention configuration was changed in Phase 0C.1. The reporting cutoff is a remaining release blocker.
