# PrimeWave V1 Phase 1B — Development implementation

## Boundary

This work is **Development only**. No Production database connection, Production migration, publish, V2 access, account reset, live payout, or principal settlement was performed. Existing binary, orbit, salary and direct/level income policies were not changed.

The approved clarification is **legacy accounting stays separate**. Historical investments keep their existing terms and claims. Their capital and ROI do not enter the SINGLE account. Historical investments still count toward the existing progressive minimum, and can establish a referral's existing V1 investment eligibility.

## Migration

`artifacts/api-server/prisma/migrations/20261114010000_single_plan_foundation/migration.sql`

Applied to the verified Development database, `heliumdb`, after checking that this was the only unapplied migration. It:

- Appends `SINGLE` to `PlanType`, retaining all legacy values.
- Makes investment duration and maturity nullable; it does not erase historical values.
- Adds nullable ROI ledger `cycleKey` and a unique investment/cycle index. Existing NULL keys remain compatible.
- Creates `single_plan_accounts`, `single_plan_events`, and `single_plan_cycles`.
- Adds foreign keys, nonnegative accounting checks, exclusive tier checks, ROI conservation/cap checks, principal bounds, permanent-qualification consistency, and event/cycle uniqueness.

All **45 pre-existing tables** were fingerprinted before and after migration. Their existing row values were unchanged (the new nullable ledger field was excluded from the comparison). Only schema and Prisma migration metadata changed.

Prisma validation passed. A read-only live Development-to-Prisma schema comparison returned **an empty migration**. This is not a Production comparison or a prediction that every future Publish operation is safe.

## Authoritative accounting

One SINGLE account per member holds original contributed capital, ROI accrued, ROI claimed, ROI compounded, claimable ROI, original principal returned, tier and first qualification time.

Derived using Decimal arithmetic:

- Principal owed = original capital − original principal returned.
- Maximum ROI = original capital × (tier − 1).
- Total entitlement = original capital × tier.
- Remaining ROI = max(0, maximum ROI − accrued ROI).

The exclusive tiers are 3× total / 2× ROI for non-working, and 5× total / 4× ROI for working. They are never added together.

The database enforces `ROI accrued = ROI claimed + ROI compounded + claimable ROI`. Earnings are counted on accrual, not counted again on claim. Other income and wallet movements are excluded.

Only an actual new SINGLE investment contribution increases original capital, in the same transaction as an atomic conditional deposit-wallet debit and contribution event. Compounding changes the calculation base, not original capital.

## Qualification

The qualification check:

1. Selects personally sponsored `ACTIVE` members, using sponsor ownership rather than cached counters.
2. Requires an `ACTIVE` investment of at least $100, consistent with existing V1 eligibility.
3. Walks actual binary parents to determine the referral's left/right leg under the sponsor. Deep placements are supported; a spillover member sponsored by somebody else does not qualify.
4. Locks the member account and records one idempotent upgrade event with left/right witnesses.
5. Permanently upgrades to tier 5. Losing activity or eligibility never downgrades it.

Checks run during SINGLE creation, actual placement, standard admin status transitions, before legacy maturity removes eligibility, and each SINGLE ROI cycle. Operational scripts that bypass standard services require separate review; no historical qualification backfill was invented.

## ROI concurrency, idempotency and claims

- Account initialization uses conflict-safe insertion followed by a row lock.
- New contributions, new-plan ROI posting, claims and compound toggles use the same account serialization.
- Scheduled and manual processing identify the same latest London midnight/noon boundary, including GMT/BST.
- A member/cycle unique key prevents duplicate runs, including zero-posting cycles.
- A second investment/cycle unique key protects the ROI ledger.
- Investments are processed by `startedAt`, then `id`.
- Each posting is the smaller of proposed ROI and remaining shared member entitlement, rounded **down** to eight decimals.
- Account balances, investment balances, ROI ledger rows, audit events and cycle marker commit together or roll back together.
- Claims re-read balances after locking and transfer claimable ROI to the income wallet once.
- Existing pending non-compounded ROI remains claimable after a SINGLE investment's compound toggle is enabled.

New investments created after a cycle boundary wait until a later eligible boundary. No historical ROI backfill or new catch-up entitlement was introduced. A failed member transaction can be retried with the same cycle identity; it cannot retain partial earnings.

Legacy ROI continues through the legacy path with historical rates/maturity. SINGLE never goes through automatic legacy maturity/principal release.

## Principal settlement

**Disabled for SINGLE**, both in backend claim eligibility and member UI, including records incorrectly marked matured. Legacy principal claims remain available under their existing rules.

The hypothetical post-3×-settlement upgrade test changes only an isolated fixture's accounting to model that scenario. It performs no settlement or principal payout. It demonstrates that a later upgrade does not enable a second principal release.

Policy still required:

- Per-investment versus member-level settlement.
- Treatment of capital contributed after an earlier settlement.
- Treatment of a permanent upgrade after an earlier 3× settlement.
- Approved exactly-once settlement/claim rules.

No permission to enable settlement should be inferred from the accounting model or tests.

## Member/admin interfaces and API

- New creation offers only Prime Wave Single at 0.8%, without fixed maturity.
- The member summary shows original capital, tier, maximum/earned/remaining ROI, cap progress, qualification, claimed/compounded/claimable ROI, and original principal returned/owed.
- Principal release is explicitly disabled, not presented as claimable.
- Progressive minimum uses the server's complete investment count, not the current page length.
- Member data refreshes after creation/claim and on focus/periodically.
- Projections for SINGLE cannot exceed remaining member ROI entitlement.
- History uses actual ROI ledger totals, not elapsed-day estimates.
- Legacy names, dates and historical terms remain readable.
- Admin investment details show the same member account.
- Admin plan/ROI controls show the locked, authoritative SINGLE policy. Conflicting plan/catalog/ROI mutations are rejected by the backend.
- Supporting income views no longer show false fixed maturities for SINGLE.
- `GET /api/investments/single-plan-summary` is authenticated and scoped to the signed-in member. Its OpenAPI contract and generated client/schema outputs were updated.

## Development runtime safeguard

Development startup no longer implicitly launches financial workers, withdrawal recovery, account resets, seeders or historical backfills. Explicit scoped Development actions remain possible. The Production startup branch and existing scheduler cadence are unchanged.

This prevents unattended workers from altering financial fixtures or pre-existing Development data during a rehearsal. No environment secret, deployment setting or live engine activation was changed.

## Verification

- Development migration applied; 45 pre-existing tables unchanged by migration.
- Prisma schema validation passed.
- Read-only Development schema comparison: empty.
- Backend and frontend TypeScript checks passed.
- OpenAPI generation and generated-library checks passed.
- Final full backend suite: **438 tests passed, 6 skipped** across 43 test files (42 passed, 1 skipped). The six skipped tests belong to the existing opt-in withdrawal integration suite; no withdrawal test run or live payout was started for this work.
- Final focused suite: **49 passed**, including **20 real Development database integration tests**, the policy/decimal/DST tests, and progressive-minimum regressions.
- Real-DB tests use uniquely generated fixtures, verify the Development database identity, mock unrelated income side effects, and clean only their own records.
- Frontend production compilation passed (a build only, not a publish); existing sourcemap/chunk-size warnings remain non-blocking.
- Signed-in browser journey passed on desktop and 402×874 mobile: $100 creation, $100 original capital / $200 maximum ROI / 3× tier, $900 remaining deposit balance, persisted compound toggles, a scoped $0.40 Development ROI cycle, ROI claim with accrued earnings counted once, history without false maturity, and disabled principal settlement.
- The browser check found and confirmed the fix for a missing `/api` prefix on the new summary request.
- The browser fixture, its financial/notification rows, temporary helper, credential files and session were cleaned up. No existing account was changed.
- Working-tier/concurrency/legacy edge cases were verified by real-DB integration tests rather than the browser. Signed-in admin screens were typechecked/built but not separately browser-tested.

The automated coverage includes both example caps, shared pools, fresh contributions, permanent upgrade/no downgrade, sponsor/placement/activity eligibility, spillover rejection, compounded basis, claims and duplicate claims, partial final posting, concurrent same/different cycles, repeated cycles, concurrent contributions, disabled principal release, modeled post-settlement upgrade, legacy history/claims, invalid/missing configuration, Decimal precision, transaction rollback/retry and database constraints.

## Files changed

### Database and financial services

- `artifacts/api-server/prisma/schema.prisma`
- `artifacts/api-server/prisma/migrations/20261114010000_single_plan_foundation/migration.sql`
- `artifacts/api-server/src/investments/single-plan.policy.ts`
- `artifacts/api-server/src/investments/single-plan.service.ts`
- `artifacts/api-server/src/investments/investments.schema.ts`
- `artifacts/api-server/src/investments/investments.service.ts`
- `artifacts/api-server/src/investments/roi.service.ts`
- `artifacts/api-server/src/investments/investments.controller.ts`
- `artifacts/api-server/src/investments/investments.routes.ts`
- `artifacts/api-server/src/cron/roi.engine.ts`
- `artifacts/api-server/src/binary/binary.service.ts` — qualification hook only.
- `artifacts/api-server/src/admin/admin-users.service.ts` — qualification hook only.
- `artifacts/api-server/src/admin/admin-investments.service.ts`
- `artifacts/api-server/src/admin/admin-plans.service.ts`
- `artifacts/api-server/src/admin/admin-repair.service.ts` — excludes SINGLE from legacy conversion.
- `artifacts/api-server/src/income/income.detail.service.ts`
- `artifacts/api-server/src/index.ts` — Development-only startup safeguard.

### UI, API contract and tests

- `artifacts/prime-wave/src/lib/api.ts`
- `artifacts/prime-wave/src/components/investments/SinglePlanSummaryPanel.tsx`
- `artifacts/prime-wave/src/pages/investments/InvestmentsPage.tsx`
- `artifacts/prime-wave/src/pages/investments/InvestmentHistoryPage.tsx`
- `artifacts/prime-wave/src/pages/admin/InvestmentsPage.tsx`
- `artifacts/prime-wave/src/pages/admin/PlansPage.tsx`
- `artifacts/prime-wave/src/pages/admin/IncomeEnginePage.tsx`
- `artifacts/prime-wave/src/pages/admin/MemberDrawer.tsx`
- `artifacts/prime-wave/src/pages/income/IncomeDetailPage.tsx`
- `artifacts/prime-wave/src/pages/income/FinancialTransparencyPage.tsx`
- `lib/api-spec/openapi.yaml`
- Generated files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`.
- `artifacts/api-server/src/investments/__tests__/single-plan.policy.test.ts`
- `artifacts/api-server/src/investments/__tests__/single-plan.integration.test.ts`
- `artifacts/api-server/src/investments/__tests__/investment-validation.test.ts`

The approved legacy-separation decision was also added to project memory.
Disposable browser-test helpers are excluded in `.gitignore` and `.replitignore`; no helper or test credential was retained.

## Production risks and next step

This is **not authorization or a recommendation to publish now**.

Before any later release: review/approve Development behavior; resolve principal policy separately; verify an owner-controlled recoverable Production backup; review the actual live schema diff and all database constraints; review deployment migration hooks and the legacy repair/activation tools; and explicitly authorize a separate rollout. Do not copy Development fixture data over Production.

Existing helper scripts that request legacy plan creation now fail closed at the creation service. They were not run or silently repurposed.

Production data, Production schema, Production readiness and any historical backup availability were not inspected or certified by this implementation.

During routine combined log collection, the existing deployed instance logged a database-connectivity crash around **2026-11-14 00:58 UTC**. This implementation was not published. No Production investigation, connection, repair or deployment change was attempted; that incident requires separate authorization and diagnosis.
