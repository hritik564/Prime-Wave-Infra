---
name: Separate BV pools for binary engines
description: Architecture of matchingLeftBV/Right and orbitLeftBV/Right as independent engine pools, and what the legacy columns now mean.
---

## Rule
Binary Matching and Binary Orbit each have their own independent BV pool:
- `matchingLeftBV` / `matchingRightBV` — read and flushed exclusively by `processMatchingCycle`
- `orbitLeftBV` / `orbitRightBV` — read and flushed exclusively by `processOrbitCycle`

Neither engine touches the other's pool. Engines are safe to run sequentially without race conditions.

## Centralized propagation
`propagateBV` (`binary/bv.service.ts`) is the single function that credits ALL pools. Every investment event writes to:
- `leftBV` / `rightBV` (legacy lifetime organic counter — salary engine, admin reports)
- `matchingLeftBV` / `matchingRightBV`
- `orbitLeftBV` / `orbitRightBV`

`addPowerBV` / `removePowerBV` (`binary/power-bv.service.ts`) also writes to both engine pools in addition to `powerLeftBV` / `powerRightBV`.

**Why:** Ensures both engines always receive identical credits. No manual sync needed when a new plan is added — just add its pool columns and update `propagateBV`.

## Legacy columns
`leftBV`, `rightBV`, `powerLeftBV`, `powerRightBV` are **never flushed** by the matching or orbit engines after this change. They accumulate as lifetime organic/power BV counters used by:
- Salary engine (rank qualification)
- Admin reports and binary tree views
- `getBvSummary` endpoint

TODO: future migration to rename them to `organicLeftBV`, `organicRightBV`, `powerOrganicLeftBV`, `powerOrganicRightBV` once all callers are audited. TODOs exist in `prisma/schema.prisma` comments.

## Flush simplification
Each engine pool is a single Decimal balance (no organic/power split within the pool). The flush is `matchedBV = min(left, right)`, carry-forward = `left - matchedBV`. The `computeBVFlush` function in `bv-flush.ts` is no longer called by either engine — it is retained only because `__tests__/power-bv.test.ts` tests it directly.

## Migration
`20260727020000_p1_separate_bv_pools` — adds the 4 columns and seeds them from `leftBV + powerLeftBV` / `rightBV + powerRightBV` so no BV is lost on upgrade.
