# Sprint 33C — Salary Engine Architecture & Data Flow

**Status:** Design Only — No production code changes in this sprint.
**Approved prerequisite sprints:** 33A (Power BV schema + admin UI), 33B (Power BV in matching/orbit engines).

---

## Context: Current System State

The existing salary engine uses:

| Model | Role |
|---|---|
| `SalaryBvLedger` | Append-only ledger: BV propagated through the binary tree (depth + side columns) — mirrors the binary BV propagation pattern |
| `SalaryRankConfig` | Configurable per-rank thresholds (`requiredBusiness`, `powerLegRequired`, `weakLegRequired`, etc.) — currently leg-oriented |
| `SalaryAchievement` | Cumulative milestone per user per rank; created once when rank is first earned; tracks payments |
| `SalaryIncome` | One record per user per rank per month; idempotency key `(userId, rankName, month, year)` |

**Core problem with the current design:** `SalaryBvLedger` propagates BV through the **binary tree** (via `binaryParentId`) and tracks left/right sides. The new design requires propagation through the **sponsor chain** (via `sponsorId`), with no left/right distinction. Team Business, Direct Business, and Power Business are three completely separate accounting pools, none of which are binary concepts.

---

## Section 1 — Data Model

### Recommendation: Three Counter Columns on `User` + One Audit Table

#### New columns on `User`

```
salaryDirectBusiness  Decimal  @default(0) @db.Decimal(18, 8)
salaryTeamBusiness    Decimal  @default(0) @db.Decimal(18, 8)
salaryPowerBusiness   Decimal  @default(0) @db.Decimal(18, 8)
salaryTeamUnlocked    Boolean  @default(false)   -- set true once Gold achieved; never reverts
salaryGoldAchievedAt  DateTime?                  -- immutable once written; used for audit
```

#### New audit table: `SalaryBusinessEvent`

```
model SalaryBusinessEvent {
  id            String         @id @default(cuid())
  userId        String                             -- the user whose counter changes
  sourceUserId  String                             -- the user whose investment/power triggered the event
  pool          SalaryPool                         -- DIRECT | TEAM | POWER
  eventType     SalaryEventType                    -- INVESTMENT_CREATED | INVESTMENT_CANCELLED |
                                                   -- INVESTMENT_REFUNDED | POWER_BV_ADDED |
                                                   -- POWER_BV_REMOVED
  delta         Decimal        @db.Decimal(18, 8)  -- positive = credit, negative = debit
  referenceId   String                             -- investmentId or powerBvLedgerId
  referenceType String                             -- "investment" | "power_bv"
  depth         Int                                -- 1 = DIRECT, 2+ = TEAM, 0 = POWER
  metadata      Json           @default("{}")
  createdAt     DateTime       @default(now())

  @@unique([userId, pool, referenceId, eventType])   -- deduplication key
  @@index([userId])
  @@index([sourceUserId])
  @@index([referenceId])
  @@index([createdAt])
}

enum SalaryPool    { DIRECT TEAM POWER }
enum SalaryEventType {
  INVESTMENT_CREATED INVESTMENT_CANCELLED INVESTMENT_REFUNDED
  POWER_BV_ADDED POWER_BV_REMOVED
}
```

---

### Why counters + audit table (not live computation)?

#### Option A — Live computation (rejected)

Every salary qualification check runs aggregate queries across all investments in the entire downline. For a mature member with 500+ downline members, this is O(N) per qualification check. The salary cron runs per member — this becomes O(M × N) where M = qualifying members. Unusable at scale.

**Rejected.**

#### Option B — Counters only, no event log (rejected)

Fast reads. But forensic reconstruction after refunds, cancellations, or bugs requires replaying from raw investment records. Diagnosing discrepancies requires a full re-scan. No idempotency key to prevent double-counting on cron retries.

**Rejected.**

#### Option C — Counters + event log (recommended)

- **Reads are O(1):** salary qualification checks read three decimal columns off the User record.
- **Writes are incremental:** each investment event touches at most one DIRECT record (the direct sponsor) and N TEAM records (ancestors at depth 2+). In practice N ≤ 15–20 for most networks.
- **Deduplication built in:** `@@unique([userId, pool, referenceId, eventType])` prevents double-counting on retry.
- **Forensic reconstruction:** the event log is immutable and sufficient to re-derive all counter values from scratch.
- **Drift detection:** a nightly reconciliation cron can re-aggregate from event logs and compare to counters; alerts on any discrepancy.

**Recommended.**

---

### What happens to `SalaryBvLedger`?

It remains in the schema and is **not deleted**. Historical records are preserved. The new engine does **not write to it** — it writes to `SalaryBusinessEvent` instead. `SalaryBvLedger` can be deprecated in a future cleanup sprint after migration is confirmed complete.

---

### What happens to `SalaryRankConfig`?

The `powerLegRequired` and `weakLegRequired` columns are binary-tree concepts (power leg = heavier side, weak leg = lighter side). They are no longer relevant to salary qualification under the new model.

**Recommendation:** Add a new `qualificationPool` column to `SalaryRankConfig`:

```
qualificationPool  SalaryQualificationPool  @default(DIRECT_ONLY)
```

```
enum SalaryQualificationPool {
  DIRECT_ONLY         -- Bronze, Silver, Gold (uses only salaryDirectBusiness)
  DIRECT_AND_UNLOCKED -- Platinum, Sapphire, Ruby, Emerald (adds team + power when unlocked)
}
```

The existing `powerLegRequired` and `weakLegRequired` columns can be nulled out for all ranks and left in the schema until a future cleanup sprint.

---

## Section 2 — Data Flow

### Sponsor chain propagation rule

The salary engine walks up the `sponsorId` chain (not the binary tree) from the investing user.

```
investor → sponsor (depth 1) → sponsor.sponsor (depth 2) → ... → root
```

- **Depth 1** = the investor's direct sponsor → receives a `DIRECT` pool credit.
- **Depth 2+** = all higher ancestors → each receives a `TEAM` pool credit.

> **Why the sponsor chain, not the binary tree?**  
> The binary tree tracks BV matching. The sponsor tree tracks who personally recruited whom. "Direct Business" is an MLM compensation concept tied to personal recruitment, not binary placement. A member's binary upline and sponsor upline can differ.

---

### Event: Investment CREATED

```
Trigger: createInvestment() succeeds and investment.status = ACTIVE

Walk sponsorId chain from investor:
  depth = 1:
    sponsor.salaryDirectBusiness += investment.amount
    write SalaryBusinessEvent {
      userId: sponsor.id, sourceUserId: investor.id,
      pool: DIRECT, eventType: INVESTMENT_CREATED,
      delta: +investment.amount, referenceId: investment.id, depth: 1
    }

  depth = 2, 3, 4, ..., until root:
    ancestor.salaryTeamBusiness += investment.amount
    write SalaryBusinessEvent {
      userId: ancestor.id, sourceUserId: investor.id,
      pool: TEAM, eventType: INVESTMENT_CREATED,
      delta: +investment.amount, referenceId: investment.id, depth: N
    }

After all counter updates:
  run salary qualification check for each affected user (or batch for cron)
```

### Event: Investment CANCELLED or REFUNDED

```
Trigger: investment is cancelled before maturity or refunded

Walk sponsorId chain from investor (same path as creation):
  depth = 1:
    sponsor.salaryDirectBusiness -= original investment.amount
    (floor at 0; log anomaly if would go negative)
    write SalaryBusinessEvent { ..., delta: -investment.amount, eventType: INVESTMENT_CANCELLED }

  depth = 2+:
    ancestor.salaryTeamBusiness -= investment.amount
    write SalaryBusinessEvent { ..., delta: -investment.amount, eventType: INVESTMENT_CANCELLED }

After counter updates:
  re-run qualification check for affected users
  if a user's rank falls below Gold AND they have not yet unlocked:
    salaryTeamUnlocked remains false (no action)
  if a user previously achieved Gold (salaryGoldAchievedAt is set):
    salaryTeamUnlocked remains TRUE — unlock is permanent
```

### Event: Investment MATURED

```
No salary counter change.
Business was credited at creation and remains credited permanently after maturity.
```

### Event: Power BV ADDED (via admin)

```
Trigger: admin calls addPowerBV() for userId, amount

  user.salaryPowerBusiness += amount
  write SalaryBusinessEvent {
    userId: user.id, sourceUserId: adminId,
    pool: POWER, eventType: POWER_BV_ADDED,
    delta: +amount, referenceId: powerBvLedger.id, depth: 0
  }

Note: Power BV does NOT propagate upline.
It is granted directly to the specified user only.

After counter update:
  run qualification check for this user
```

### Event: Power BV REMOVED (via admin)

```
Trigger: admin calls removePowerBV() for userId, amount

  user.salaryPowerBusiness -= amount  (floor at 0; log if would go negative)
  write SalaryBusinessEvent {
    userId: user.id, sourceUserId: adminId,
    pool: POWER, eventType: POWER_BV_REMOVED,
    delta: -amount, referenceId: powerBvLedger.id, depth: 0
  }

After counter update:
  run qualification check for this user
  if effective qualification BV drops below a rank threshold:
    existing SalaryAchievements are NOT retroactively revoked
    (achievements already earned remain; no new achievements are issued this cycle)
```

### Event: User DEACTIVATED

```
No salary counter changes.
Business already accumulated is preserved.
Qualification check skips INACTIVE users — they cannot receive new achievements.
Existing active SalaryAchievements continue paying out per the achievement schedule.
```

### Event: User REACTIVATED

```
No counter changes needed (counters were preserved).
User becomes eligible for qualification checks again in the next cron cycle.
```

### Event: Rank ACHIEVED (Gold specifically)

```
Triggered when salary qualification engine determines user has crossed Gold threshold:
  user.salaryTeamUnlocked = true
  user.salaryGoldAchievedAt = now()   (only written once; never overwritten)

From this moment forward:
  effective qualification BV for Platinum+ ranks includes salaryTeamBusiness + salaryPowerBusiness
  All previously accumulated Team Business and Power Business immediately contributes
  Future Team Business and Power Business also contributes
```

---

## Section 3 — Qualification Engine

### Rank groups

**Group A — Direct Only:** Bronze, Silver, Gold
```
qualifying_business = salaryDirectBusiness
```

**Group B — All Pools (after unlock):** Platinum, Sapphire, Ruby, Emerald
```
qualifying_business = salaryDirectBusiness
                    + (salaryTeamUnlocked ? salaryTeamBusiness : 0)
                    + (salaryTeamUnlocked ? salaryPowerBusiness : 0)
```

> The unlock gate for Group B is the **Gold achievement**, not the current BV level. A user who achieved Gold and later lost Direct Business still keeps their unlock flag — they just can't earn new Platinum+ achievements until their effective BV clears the Platinum threshold.

### Calculation flow

```
function computeSalaryQualification(user):
  directBV  = user.salaryDirectBusiness
  teamBV    = user.salaryTeamUnlocked ? user.salaryTeamBusiness : Decimal(0)
  powerBV   = user.salaryTeamUnlocked ? user.salaryPowerBusiness : Decimal(0)

  for each SalaryRankConfig (ordered ascending by requiredBusiness):
    if config.qualificationPool = DIRECT_ONLY:
      effectiveBV = directBV
    else:
      effectiveBV = directBV + teamBV + powerBV

    if effectiveBV >= config.requiredBusiness:
      if user does NOT already have a SalaryAchievement for this rankName:
        create SalaryAchievement (achievedAt=now, expiresAt=now+durationMonths)
        if rankName = "Gold" AND user.salaryGoldAchievedAt IS NULL:
          set user.salaryTeamUnlocked = true
          set user.salaryGoldAchievedAt = now()
          // immediately re-evaluate Group B ranks in this same pass
```

### Key invariants

- A rank is awarded at most once per user per rank (enforced by `@@unique([userId, rankName])` on `SalaryAchievement`).
- Achievements are never revoked by a counter decrease — the cumulative milestone model is preserved.
- The existing `SalaryAchievement.isActive` flag still controls payment eligibility (becomes false when `paymentsMade >= durationMonths` or `expiresAt` passes).

---

## Section 4 — Lock / Unlock Logic

### Pre-Gold state

```
salaryTeamUnlocked = false (default)

Member sees:
  - Direct Business: visible, counts toward Bronze/Silver/Gold
  - Team Business: visible, LOCKED — "Unlock at Gold"
  - Power Business: visible, LOCKED — "Unlock at Gold"
  - Effective BV for Platinum+: = directBV only (team + power excluded)
```

### Gold threshold crossed (first time)

```
ATOMIC transaction:
  1. Create SalaryAchievement { rankName: "Gold", achievedAt: now() }
  2. user.salaryTeamUnlocked = true
  3. user.salaryGoldAchievedAt = now()
  4. Re-evaluate Platinum+ ranks immediately using now-unlocked pools

Member sees immediately:
  - Team Business: UNLOCKED — shows full accumulated amount
  - Power Business: UNLOCKED — shows full accumulated amount
  - Effective BV for Platinum+ = directBV + teamBV + powerBV
```

### Post-Gold state — what if Direct Business falls?

```
salaryTeamUnlocked stays TRUE (irreversible).
The user cannot earn a NEW Gold achievement if theirs expires (it already exists as @@unique).
The user continues accumulating Team Business and Power Business.
Platinum+ achievements are still achievable as long as effectiveBV >= threshold.
```

### Lock summary

| Condition | Team Business | Power Business |
|---|---|---|
| User never achieved Gold | Locked | Locked |
| User achieved Gold (ever) | Unlocked permanently | Unlocked permanently |

There is no re-lock mechanism. The unlock is a one-way flag.

---

## Section 5 — Migration Plan

### Principles

- Zero downtime (additive-only schema changes first).
- No loss of existing `SalaryAchievement` or `SalaryIncome` records.
- Backfill runs in batches — never in one unbounded query.
- New engine is feature-flagged; old engine disabled after backfill is verified.

### Migration steps

**Step 1 — Schema migration (non-breaking)**
```
Add to User:
  salaryDirectBusiness  Decimal @default(0)
  salaryTeamBusiness    Decimal @default(0)
  salaryPowerBusiness   Decimal @default(0)
  salaryTeamUnlocked    Boolean @default(false)
  salaryGoldAchievedAt  DateTime?

Create SalaryBusinessEvent table.
Add qualificationPool to SalaryRankConfig (default DIRECT_ONLY).

Run: db:migrate (named migration, zero-downtime, all new columns are nullable or have defaults)
```

**Step 2 — Backfill unlock flags**
```
For each user with a SalaryAchievement where rankName = "Gold":
  user.salaryTeamUnlocked = true
  user.salaryGoldAchievedAt = achievement.achievedAt

Batch size: 100 users at a time, 50ms delay between batches.
```

**Step 3 — Backfill Direct Business counters**
```
For each investment with status IN [ACTIVE, MATURED, COMPLETED]:
  sponsor = investment.user.sponsor (sponsorId → User)
  if sponsor exists:
    sponsor.salaryDirectBusiness += investment.amount
    write SalaryBusinessEvent (DIRECT, INVESTMENT_CREATED, depth=1)

Batch: process investments in createdAt order, 200 at a time.
```

**Step 4 — Backfill Team Business counters**
```
For each investment with status IN [ACTIVE, MATURED, COMPLETED]:
  Walk sponsorId chain from investor:
    depth 2+: ancestor.salaryTeamBusiness += investment.amount
    write SalaryBusinessEvent (TEAM, INVESTMENT_CREATED, depth=N)

Note: Cancelled and refunded investments are excluded (status filter).
This means the counter represents NET active business, not gross historical flow.

Batch: same 200-at-a-time pattern.
```

**Step 5 — Backfill Power Business counters**
```
salaryPowerBusiness = 0 for all users.
Power BV is a new system (Sprint 33A); no historical grants exist.
No action needed.
```

**Step 6 — Verification**
```
For a sample of 50 users (spread across rank levels):
  Re-aggregate from SalaryBusinessEvent and compare to User counters.
  Alert if any discrepancy > $0.01.

Run the new qualification engine against all users in a dry-run mode:
  Compare results to current SalaryAchievement records.
  Expect exact match for Bronze/Silver/Gold.
  Log any Platinum+ discrepancies for manual review.
```

**Step 7 — Enable new engine, disable old**
```
Deploy new salary qualification service (sprint 33E).
Remove old SalaryBvLedger writes from investment service.
Keep SalaryBvLedger table and existing records (read-only, historical).
Monitor for 48 hours.
```

**Step 8 — Update SalaryRankConfig**
```
Set qualificationPool = DIRECT_AND_UNLOCKED for Platinum, Sapphire, Ruby, Emerald.
Set qualificationPool = DIRECT_ONLY for Bronze, Silver, Gold.
Null out powerLegRequired and weakLegRequired on all records.
```

---

## Section 6 — Admin Panel Impact

### New views required

| View | Description |
|---|---|
| **Salary Business Summary** (per user) | Shows directBusiness, teamBusiness, powerBusiness, effectiveBV, current rank, unlock status, goldAchievedAt |
| **Salary Business Event Log** (per user) | Paginated list of SalaryBusinessEvent records with delta, pool, referenceId, eventType, timestamp |
| **Salary Rank Config editor** | Existing table, plus new `qualificationPool` column. Remove powerLegRequired/weakLegRequired from the form |

### No new admin write actions required

- Power BV management (Sprint 33A) already handles Power Business grants.
- Team and Direct Business are computed from investment events — admin cannot and should not manually override them.
- The existing "Salary Achievement" and "Salary Income" admin views remain unchanged.

### Optional: Reconciliation trigger

A "Recalculate Salary Counters" button in the admin panel that triggers the reconciliation cron on demand for a specific user. Useful for investigating suspected discrepancies without waiting for the nightly cron.

---

## Section 7 — Member Dashboard

### Recommended layout

```
┌─────────────────────────────────────────────────┐
│  SALARY QUALIFICATION                           │
│  Current Rank: SILVER  ───────●────────────     │
│                        Bronze Silver Gold       │
├─────────────────────────────────────────────────┤
│  DIRECT BUSINESS                                │
│  $12,400  ████████████████░░░  Target: $15,000  │
│  (counts toward Bronze · Silver · Gold)         │
├─────────────────────────────────────────────────┤
│  TEAM BUSINESS          🔒 LOCKED               │
│  $8,200   ░░░░░░░░░░░░░░░░░░░  (accumulating)   │
│  Achieve Gold Salary Rank to unlock             │
├─────────────────────────────────────────────────┤
│  POWER BUSINESS         🔒 LOCKED               │
│  $1,500   ░░░░░░░░░░░░░░░░░░░  (accumulating)   │
│  Achieve Gold Salary Rank to unlock             │
├─────────────────────────────────────────────────┤
│  EFFECTIVE BUSINESS (when Gold achieved)        │
│  = Direct + Team + Power = $22,100              │
│  Next rank after Gold: Platinum ($50,000)       │
└─────────────────────────────────────────────────┘
```

**After Gold is achieved:**
```
  TEAM BUSINESS            🔓 UNLOCKED
  $8,200   ████████░░░░░░  contributing to Platinum+

  POWER BUSINESS           🔓 UNLOCKED
  $1,500   ███░░░░░░░░░░░  contributing to Platinum+
```

### UX principles

- All three pools are always visible regardless of lock status. Nothing is ever hidden.
- Locked pools show their accumulated amount with a clear lock indicator and the unlock condition.
- Progress bars always show the next-in-line rank, not a fixed target.
- A tooltip explains why Team and Power Business are locked and what unlocking them would add to qualification.
- The "Effective Business" section updates in real time once unlocked.

---

## Section 8 — Performance

### Recommendation: Incremental counters (not live computation)

**Reason 1 — Downline scan is unbounded.**  
Computing Team Business live for a mature member requires scanning every investment across every node in their entire downline subtree. In a network of 10,000 members, a top-level member could have 5,000+ descendants. An O(5,000) scan on every API request or cron tick is unacceptable.

**Reason 2 — Salary qualification runs per-user in the cron.**  
If we had 1,000 qualifying users and each ran a live aggregate, that's 1,000 separate aggregation queries every cron cycle. With counters, it is 1,000 single-row reads.

**Reason 3 — Counters can drift, and that is safe to detect.**  
A nightly reconciliation cron re-aggregates from `SalaryBusinessEvent` and compares to User counters. Drift is automatically detected and alertable. Counters can be corrected without touching the audit log.

**Reason 4 — Incremental writes are bounded.**  
When an investment is created, the walk up the sponsor chain touches at most D ancestors, where D = depth of the investor in the sponsor tree. Typical D ≤ 20. This is O(D) writes per investment, all within a single transaction.

---

## Section 9 — Edge Cases

### Refunds and cancellations

- The salary engine **subtracts** the investment amount from all affected pools when an investment is cancelled or refunded.
- If a counter would go negative (e.g., due to a bug or retroactive data fix), it is **floored at 0** and an anomaly event is logged for manual review.
- Achieved `SalaryAchievement` records are **never retroactively revoked** by a counter decrease.

### Power BV removal

- `salaryPowerBusiness -= removed_amount`, floored at 0.
- If the user had achieved a higher rank based on Power Business, that achievement remains active until it expires naturally (`paymentsMade >= durationMonths` or `expiresAt`). No retroactive revocation.
- Future qualification checks use the reduced `salaryPowerBusiness`.

### Member suspension

- Suspended users do not receive new `SalaryAchievement` records (qualification check skips `status != ACTIVE`).
- Their accumulated counters are preserved untouched.
- Existing active `SalaryAchievement` records continue to pay out (the salary scheduler checks `isActive`, not `user.status`). If suspension should halt payouts, that is a business policy decision — recommend adding an explicit `pausedAt` field to `SalaryAchievement`.

### Member reactivation

- Counters are already accurate (preserved during suspension).
- The next salary cron cycle includes this user in the qualification check.
- No recalculation needed.

### Historic salary achievements

- All existing `SalaryAchievement` records are preserved through the migration.
- `salaryGoldAchievedAt` is backfilled from the earliest Gold `SalaryAchievement.achievedAt`.
- `salaryTeamUnlocked` is set `true` for any user who has a Gold `SalaryAchievement`.

### Duplicate events / cron retries

- `SalaryBusinessEvent` has a `@@unique([userId, pool, referenceId, eventType])` constraint.
- A duplicate write attempt (same referenceId + eventType for the same user and pool) will throw a Prisma P2002 and the counter will not be double-incremented.
- The salary cron uses the same `@@unique([userId, rankName, month, year])` idempotency key on `SalaryIncome` that already exists.

### Race conditions

- All counter updates use Prisma `increment` / `decrement` operators, not read-then-write. These are atomic at the database level.
- Multiple investments created concurrently for downline members will correctly and independently update ancestor counters without races.
- The qualification check runs **after** all counter writes in the same transaction — it reads the committed value.

### Power BV removal removes more than accumulated

- Example: admin adds 1,000 BV, then removes 1,500 BV.
- The `removePowerBV` service (Sprint 33A) already prevents removal of more than the current `powerLeftBV`/`powerRightBV` balance.
- For `salaryPowerBusiness`, the same guard applies: removal is floored at the current counter value, not allowed to go negative.

### Rank qualification during backfill

- During the backfill window, the new qualification engine is not yet active.
- Existing salary cron continues to run using the old engine.
- The new engine only becomes active in Sprint 33E, after backfill is verified.
- There is no risk of double-awarding achievements because the new engine checks for existing `SalaryAchievement` records before creating new ones.

### Sponsor chain loops (data integrity)

- The sponsor chain must be a directed acyclic graph (DAG). The registration flow prevents cycles by only allowing existing users as sponsors.
- The backfill and event propagation should include a depth cap (e.g., max 50 levels) with an alert if the cap is hit, as a safety guard against any legacy data anomalies.

---

## Section 10 — Implementation Plan

### Sprint 33D — Database

- Add `salaryDirectBusiness`, `salaryTeamBusiness`, `salaryPowerBusiness`, `salaryTeamUnlocked`, `salaryGoldAchievedAt` to `User`.
- Create `SalaryBusinessEvent` table with enums and indexes.
- Add `qualificationPool` to `SalaryRankConfig`.
- Run and verify migration on dev; prepare named migration for production.
- Update `SalaryRankConfig` seed data with correct `qualificationPool` values.

### Sprint 33E — Backend Salary Service

- New `salary-business.service.ts`: functions for `creditDirectBusiness`, `creditTeamBusiness`, `creditPowerBusiness`, and their debit counterparts.
- New `salary-qualification.service.ts`: `computeQualification(userId)` — reads counters, evaluates ranks, creates achievements.
- Hook `creditDirectBusiness` / `creditTeamBusiness` into `investments.service.ts` (investment creation and cancellation).
- Hook `creditPowerBusiness` into `power-bv.service.ts` (add/remove operations).
- Hook `checkUnlock` into `salary-qualification.service.ts` when Gold is achieved.
- All writes in Prisma transactions; deduplication via unique constraint.

### Sprint 33F — Salary Scheduler

- Update the salary qualification cron to call `computeQualification` using new counters.
- Update the salary payout cron to continue using existing `SalaryAchievement` + `SalaryIncome` logic (no change to payout mechanics).
- Add nightly reconciliation cron: re-aggregate from `SalaryBusinessEvent` and compare to counters; alert on drift.
- Remove old `SalaryBvLedger` write calls from the investment service.

### Sprint 33G — Admin UI

- New "Salary Business" tab in `MemberDrawer`: shows all three pool counters, unlock status, and `SalaryBusinessEvent` log.
- Update `SalaryRankConfig` admin editor: add `qualificationPool` field; hide/remove `powerLegRequired` and `weakLegRequired` inputs.
- Optional: "Recalculate" button that triggers qualification re-check for a single user.

### Sprint 33H — Member Dashboard

- New "Salary Qualification" section on member dashboard.
- Shows: current rank, Direct Business progress bar, Team Business (locked/unlocked), Power Business (locked/unlocked), Effective Business, next rank target.
- All amounts visible regardless of lock state.

### Sprint 33I — Testing

- Unit tests: `computeBVFlush`-style pure function tests for `computeQualification` — all rank thresholds, lock/unlock transitions, edge cases from Section 9.
- Integration tests: full investment → counter update → qualification → achievement flow.
- Backfill script dry-run tests against a copy of production data (anonymised).
- Cron idempotency tests: run cron twice for the same period; verify no duplicate records.

### Sprint 33J — Migration

- Run backfill script on production in maintenance-free batches.
- Verify counters against a 10% random sample of users.
- Enable new qualification engine; disable old `SalaryBvLedger` propagation.
- Monitor for 48 hours; reconciliation cron provides ongoing confidence.

---

## Summary of Key Decisions

| Decision | Recommendation |
|---|---|
| Propagation chain | Sponsor chain (`sponsorId`), NOT the binary tree (`binaryParentId`) |
| Counter storage | Three Decimal columns on User — O(1) reads |
| Audit trail | `SalaryBusinessEvent` immutable append-only log |
| Deduplication | `@@unique([userId, pool, referenceId, eventType])` |
| Gold unlock | One-way flag (`salaryTeamUnlocked`); never reverts |
| Rank revocation | Never — cumulative milestone model preserved |
| Power Business propagation | None — grants apply to the recipient user only |
| Live vs incremental | Incremental counters; nightly drift reconciliation |
| Migration approach | Additive schema → batch backfill → feature flag → verify |
| `SalaryBvLedger` | Preserved (read-only); deprecated in a future cleanup sprint |
