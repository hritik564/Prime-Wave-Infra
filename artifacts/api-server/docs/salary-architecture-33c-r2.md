# Sprint 33C Revision 2 — Salary Engine Architecture & Data Flow

**Status:** Design Only — No production code changes.
**Supersedes:** `salary-architecture-33c.md` (Revision 1)
**Approved prerequisite sprints:** 33A (Power BV schema + admin UI), 33B (Power BV in matching/orbit engines).

### Changes from Revision 1

| # | Change | Detail |
|---|---|---|
| 1 | Remove duplicated unlock state | `salaryTeamUnlocked` and `salaryGoldAchievedAt` removed from User; unlock derived from existing `SalaryAchievement` |
| 2 | Rename pool | `salaryTeamBusiness` → `salaryDownlineBusiness` everywhere |
| 3 | Enum renamed | `DIRECT_AND_UNLOCKED` → `ALL_BUSINESS` on `SalaryQualificationPool` |
| 4 | New API | `GET /api/salary/summary` specification added |

---

## Section 1 — Data Model

### New columns on `User` (two columns, not four)

```
salaryDirectBusiness   Decimal  @default(0) @db.Decimal(18, 8)
salaryDownlineBusiness Decimal  @default(0) @db.Decimal(18, 8)
salaryPowerBusiness    Decimal  @default(0) @db.Decimal(18, 8)
```

> **Why not `salaryTeamUnlocked` and `salaryGoldAchievedAt`?**
>
> These were proposed in Revision 1 as fast-read shortcuts. However, the existing
> `SalaryAchievement` table is already the source of truth for every rank a user has
> ever earned.  Duplicating the Gold-achieved state onto the User row creates a second
> source of truth that can drift (e.g. if an achievement record is corrected by an admin
> but the flag is not updated). The qualification engine is fast enough to do a single
> indexed lookup — `SalaryAchievement WHERE userId = ? AND rankName = 'Gold' LIMIT 1`
> — and this lookup is the sole authoritative signal for unlock status.

### Unlock derivation query (replaces boolean flag)

```sql
SELECT EXISTS (
  SELECT 1 FROM salary_achievement
  WHERE user_id = $userId
    AND rank_name = 'Gold'
  LIMIT 1
) AS is_unlocked;
```

This runs against an indexed column and is effectively O(1). It is called once per qualification check, not per API request (the `GET /api/salary/summary` endpoint computes and returns it directly).

---

### New audit table: `SalaryBusinessEvent`

```prisma
model SalaryBusinessEvent {
  id            String          @id @default(cuid())
  userId        String                              -- user whose counter is changing
  sourceUserId  String                              -- investor or admin who triggered event
  pool          SalaryPool                          -- DIRECT | DOWNLINE | POWER
  eventType     SalaryEventType                     -- see enum below
  delta         Decimal         @db.Decimal(18, 8)  -- positive = credit, negative = debit
  referenceId   String                              -- investmentId or powerBvLedgerId
  referenceType String                              -- "investment" | "power_bv"
  depth         Int                                 -- 1 = DIRECT, 2+ = DOWNLINE, 0 = POWER
  metadata      Json            @default("{}")
  createdAt     DateTime        @default(now())

  user   User @relation(fields: [userId],       references: [id], onDelete: Restrict)
  source User @relation(fields: [sourceUserId], references: [id], onDelete: Restrict)

  @@unique([userId, pool, referenceId, eventType])  -- deduplication key
  @@index([userId])
  @@index([sourceUserId])
  @@index([referenceId])
  @@index([createdAt])
  @@map("salary_business_event")
}

enum SalaryPool {
  DIRECT
  DOWNLINE
  POWER
}

enum SalaryEventType {
  INVESTMENT_CREATED
  INVESTMENT_CANCELLED
  INVESTMENT_REFUNDED
  POWER_BV_ADDED
  POWER_BV_REMOVED
}
```

---

### Updated `SalaryRankConfig` — `qualificationPool` column

```prisma
model SalaryRankConfig {
  // ... existing columns unchanged ...
  qualificationPool SalaryQualificationPool @default(DIRECT_ONLY)
}

enum SalaryQualificationPool {
  DIRECT_ONLY   -- Bronze, Silver, Gold: uses salaryDirectBusiness only
  ALL_BUSINESS  -- Platinum, Sapphire, Ruby, Emerald: direct + downline + power (when unlocked)
}
```

> **Why `ALL_BUSINESS` instead of `DIRECT_AND_UNLOCKED`?**
>
> The enum value should describe *what business counts*, not *when* it becomes available.
> The unlock condition (Gold achievement) is a business rule in the qualification engine —
> if that rule ever changes (e.g., unlock at Silver in a future plan revision), the schema
> enum does not need to change. `ALL_BUSINESS` is declarative ("these ranks use all pools
> when they are available") while `DIRECT_AND_UNLOCKED` is procedural ("and also check a
> flag"). The engine determines availability; the enum describes intent.

#### Seed values

| Rank | `qualificationPool` |
|---|---|
| Bronze | `DIRECT_ONLY` |
| Silver | `DIRECT_ONLY` |
| Gold | `DIRECT_ONLY` |
| Platinum | `ALL_BUSINESS` |
| Sapphire | `ALL_BUSINESS` |
| Ruby | `ALL_BUSINESS` |
| Emerald | `ALL_BUSINESS` |

---

### What is NOT added to User

| Removed field | Reason |
|---|---|
| `salaryTeamUnlocked` | Derived from `SalaryAchievement WHERE rankName = 'Gold'`; no duplication |
| `salaryGoldAchievedAt` | Derivable from `SalaryAchievement.achievedAt WHERE rankName = 'Gold'` |

---

## Section 2 — Data Flow

### Sponsor chain propagation rule

The salary engine walks the **sponsor chain** (`sponsorId`) from the investing user — not the binary tree (`binaryParentId`).

```
investor → sponsor (depth 1) → sponsor.sponsor (depth 2) → ... → root
```

- **Depth 1** → `pool: DIRECT` — credited to the investor's direct sponsor only.
- **Depth 2+** → `pool: DOWNLINE` — credited to every ancestor beyond the direct sponsor.

Power Business (`pool: POWER`) has no chain: it is credited directly to the specified user and does not propagate.

---

### Event: Investment CREATED

```
Trigger: investment.status = ACTIVE (created by createInvestment service)

For each ancestor in sponsorId chain, starting from investor:

  depth = 1 (direct sponsor):
    sponsor.salaryDirectBusiness   += investment.amount   [atomic Prisma increment]
    INSERT SalaryBusinessEvent {
      userId: sponsor.id, sourceUserId: investor.id,
      pool: DIRECT, eventType: INVESTMENT_CREATED,
      delta: +investment.amount, referenceId: investment.id, depth: 1
    }

  depth = 2, 3, ..., N (all further ancestors):
    ancestor.salaryDownlineBusiness += investment.amount  [atomic Prisma increment]
    INSERT SalaryBusinessEvent {
      userId: ancestor.id, sourceUserId: investor.id,
      pool: DOWNLINE, eventType: INVESTMENT_CREATED,
      delta: +investment.amount, referenceId: investment.id, depth: N
    }

Safety: cap sponsor-chain walk at depth 50; log and alert if cap is hit.
Deduplication: the @@unique constraint silently prevents double-write on cron retry.
```

### Event: Investment CANCELLED or REFUNDED

```
Trigger: investment status transitions to CANCELLED or REFUNDED

Mirror of creation (same chain, negative deltas):

  depth = 1:
    sponsor.salaryDirectBusiness   -= investment.amount   [atomic decrement; floor at 0]
    INSERT SalaryBusinessEvent { ..., delta: -investment.amount, eventType: INVESTMENT_CANCELLED }

  depth = 2+:
    ancestor.salaryDownlineBusiness -= investment.amount  [atomic decrement; floor at 0]
    INSERT SalaryBusinessEvent { ..., delta: -investment.amount, eventType: INVESTMENT_CANCELLED }

Floor-at-zero: if decrement would produce a negative, clamp to 0 and write an anomaly
notification to AdminLog for manual review. The counter itself must never go negative.
```

### Event: Investment MATURED

```
No counter change.
Business was permanently credited at creation.
```

### Event: Power BV ADDED (admin action)

```
Trigger: admin calls addPowerBV(userId, amount)

  user.salaryPowerBusiness += amount   [atomic increment]
  INSERT SalaryBusinessEvent {
    userId: user.id, sourceUserId: adminId (from req.user.sub),
    pool: POWER, eventType: POWER_BV_ADDED,
    delta: +amount, referenceId: powerBvLedger.id, depth: 0
  }

Power Business does NOT propagate upward.
```

### Event: Power BV REMOVED (admin action)

```
Trigger: admin calls removePowerBV(userId, amount)

  user.salaryPowerBusiness -= amount   [atomic decrement; floor at 0]
  INSERT SalaryBusinessEvent {
    userId: user.id, sourceUserId: adminId,
    pool: POWER, eventType: POWER_BV_REMOVED,
    delta: -amount, referenceId: powerBvLedger.id, depth: 0
  }
```

### Event: User DEACTIVATED / REACTIVATED

```
No counter changes.
Counters are preserved exactly.
Qualification check skips INACTIVE users (no new achievements).
Reactivation: existing counters are immediately valid; no recalculation.
```

### Event: Rank achieved (Gold specifically — unlock trigger)

```
This is not a counter event. It is a state transition in the qualification engine.

When computeQualification() determines that a user has crossed the Gold threshold:
  CREATE SalaryAchievement { rankName: "Gold", achievedAt: now(), ... }
  (The @@unique constraint on (userId, rankName) ensures this happens at most once.)

From this point forward, the unlock query returns true:
  SELECT EXISTS (... WHERE rankName = 'Gold') → true

The qualification engine immediately re-evaluates ALL_BUSINESS ranks in the same pass,
now including salaryDownlineBusiness and salaryPowerBusiness in effectiveBusiness.
```

---

## Section 3 — Qualification Engine

### Unlock state — derived, not stored

```typescript
async function isTeamUnlocked(userId: string, tx: PrismaTx): Promise<boolean> {
  const goldAchievement = await tx.salaryAchievement.findFirst({
    where:  { userId, rankName: "Gold" },
    select: { id: true },
  });
  return goldAchievement !== null;
}
```

This runs once per qualification pass. It is an indexed lookup — effectively O(1).

### Effective business calculation

```typescript
function computeEffectiveBusiness(
  user:      { salaryDirectBusiness: Decimal; salaryDownlineBusiness: Decimal; salaryPowerBusiness: Decimal },
  unlocked:  boolean,
  pool:      SalaryQualificationPool,
): Decimal {
  if (pool === "DIRECT_ONLY") {
    return user.salaryDirectBusiness;
  }
  // ALL_BUSINESS — downline and power are included only if unlocked
  return user.salaryDirectBusiness
    .plus(unlocked ? user.salaryDownlineBusiness : new Decimal(0))
    .plus(unlocked ? user.salaryPowerBusiness    : new Decimal(0));
}
```

### Full qualification pass

```typescript
async function computeQualification(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where:  { id: userId, status: "ACTIVE" },
      select: { salaryDirectBusiness: true, salaryDownlineBusiness: true, salaryPowerBusiness: true },
    });
    if (!user) return;   // inactive or not found — skip

    const unlocked = await isTeamUnlocked(userId, tx);
    const configs  = await tx.salaryRankConfig.findMany({
      where:   { isActive: true },
      orderBy: { requiredBusiness: "asc" },
    });

    for (const config of configs) {
      const effectiveBV = computeEffectiveBusiness(user, unlocked, config.qualificationPool);

      if (effectiveBV.gte(config.requiredBusiness)) {
        // Create achievement only if it does not already exist
        await tx.salaryAchievement.upsert({
          where:  { userId_rankName: { userId, rankName: config.rankName } },
          create: {
            userId,
            rankName:      config.rankName,
            achievedAt:    new Date(),
            expiresAt:     addMonths(new Date(), config.durationMonths),
            monthlyAmount: config.monthlySalary,
            isActive:      true,
          },
          update: {},   // already exists — do not overwrite
        });
      }
    }
  });
}
```

### Key invariants

- Achievements are **never revoked** by counter decreases.
- The cumulative milestone model (`@@unique([userId, rankName])`) is fully preserved.
- `isTeamUnlocked` is derived live inside the transaction — no duplicated state.
- Group A (DIRECT_ONLY) ranks are evaluated with the same engine; `computeEffectiveBusiness` returns only `salaryDirectBusiness` for them.

---

## Section 4 — Lock / Unlock Logic

### Pre-Gold state

```
User counters at any time:
  salaryDirectBusiness   = $12,400   (live, counts toward Bronze/Silver/Gold)
  salaryDownlineBusiness = $8,200    (accumulated, locked for Platinum+)
  salaryPowerBusiness    = $1,500    (accumulated, locked for Platinum+)

isTeamUnlocked() = false  (no Gold SalaryAchievement exists)

effectiveBusiness for ALL_BUSINESS ranks = $12,400 only
```

### Gold threshold crossed

```
computeQualification() creates SalaryAchievement { rankName: "Gold" }
@@unique ensures this is written exactly once

isTeamUnlocked() now returns true

effectiveBusiness for ALL_BUSINESS ranks = $12,400 + $8,200 + $1,500 = $22,100

All previously accumulated Downline and Power Business immediately contributes.
Future Downline and Power accumulation also contributes without any further action.
```

### Post-Gold: Direct Business falls

```
salaryTeamUnlocked flag does not exist — nothing reverts.
isTeamUnlocked() still returns true (the Gold SalaryAchievement record persists).
Platinum+ ranks remain achievable based on the new effectiveBusiness.
New Gold achievement cannot be created (@@unique prevents it).
```

### Lock summary

| Condition | Downline Business | Power Business |
|---|---|---|
| No Gold SalaryAchievement | Locked for Platinum+ | Locked for Platinum+ |
| Gold SalaryAchievement exists (ever) | Permanently unlocked | Permanently unlocked |

No flag to maintain, no risk of drift.

---

## Section 5 — New API: `GET /api/salary/summary`

### Purpose

The frontend must never independently calculate qualification state. All salary display logic is computed server-side and returned as a single structured response.

### Route

```
GET /api/salary/summary
Authorization: Bearer <JWT>
```

The endpoint is called by the authenticated user for their own summary. It resolves `userId` from `req.user.sub`.

An admin variant may be added later:
```
GET /api/admin/salary/:userId/summary
Authorization: Bearer <admin JWT>
```

### Response shape

```typescript
interface SalarySummaryResponse {
  userId:             string;
  username:           string;

  // Pool counters (raw)
  directBusiness:     string;   // Decimal as string, 8dp
  downlineBusiness:   string;
  powerBusiness:      string;

  // Unlock state — derived from SalaryAchievement
  isUnlocked:         boolean;
  unlockedAt:         string | null;   // ISO-8601 of Gold achievedAt, or null

  // Effective business (what the qualification engine actually uses)
  effectiveBusiness:  string;          // direct + (unlocked ? downline + power : 0)

  // Current rank — highest active SalaryAchievement
  currentRank:        string | null;   // null if no achievements

  // Next rank to achieve
  nextRank: {
    rankName:           string;
    qualificationPool:  "DIRECT_ONLY" | "ALL_BUSINESS";
    requiredBusiness:   string;
    remainingBusiness:  string;   // requiredBusiness - effectiveBusiness (clamped ≥ 0)
    monthlySalary:      string;
  } | null;

  // All ranks with their status
  ranks: Array<{
    rankName:           string;
    qualificationPool:  "DIRECT_ONLY" | "ALL_BUSINESS";
    requiredBusiness:   string;
    effectiveBusiness:  string;   // what this rank's pool sees (may differ from top-level)
    isAchieved:         boolean;
    isActive:           boolean;  // achievement is active (paying out)
    achievedAt:         string | null;
    monthlySalary:      string;
  }>;
}
```

### Logic

```typescript
async function getSalarySummary(userId: string): Promise<SalarySummaryResponse> {
  const [user, achievements, configs] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { id: true, username: true,
                salaryDirectBusiness: true,
                salaryDownlineBusiness: true,
                salaryPowerBusiness: true },
    }),
    prisma.salaryAchievement.findMany({
      where:   { userId },
      orderBy: { achievedAt: "asc" },
    }),
    prisma.salaryRankConfig.findMany({
      where:   { isActive: true },
      orderBy: { requiredBusiness: "asc" },
    }),
  ]);

  const goldAchievement = achievements.find(a => a.rankName === "Gold") ?? null;
  const isUnlocked      = goldAchievement !== null;

  const directBV   = user.salaryDirectBusiness;
  const downlineBV = isUnlocked ? user.salaryDownlineBusiness : new Decimal(0);
  const powerBV    = isUnlocked ? user.salaryPowerBusiness    : new Decimal(0);
  const effectiveBV = directBV.plus(downlineBV).plus(powerBV);

  const achievedRankNames = new Set(achievements.map(a => a.rankName));
  const activeAchievements = new Set(
    achievements.filter(a => a.isActive).map(a => a.rankName)
  );

  // Current rank = highest rank with an active achievement
  const currentRank = configs
    .filter(c => activeAchievements.has(c.rankName))
    .at(-1)?.rankName ?? null;

  // Next rank = lowest not-yet-achieved rank
  const nextConfig = configs.find(c => !achievedRankNames.has(c.rankName)) ?? null;

  const rankRows = configs.map(c => {
    const poolBV = c.qualificationPool === "DIRECT_ONLY"
      ? directBV
      : effectiveBV;
    return {
      rankName:          c.rankName,
      qualificationPool: c.qualificationPool,
      requiredBusiness:  c.requiredBusiness.toFixed(8),
      effectiveBusiness: poolBV.toFixed(8),
      isAchieved:        achievedRankNames.has(c.rankName),
      isActive:          activeAchievements.has(c.rankName),
      achievedAt:        achievements.find(a => a.rankName === c.rankName)?.achievedAt.toISOString() ?? null,
      monthlySalary:     c.monthlySalary.toFixed(2),
    };
  });

  const nextRank = nextConfig
    ? {
        rankName:          nextConfig.rankName,
        qualificationPool: nextConfig.qualificationPool,
        requiredBusiness:  nextConfig.requiredBusiness.toFixed(8),
        remainingBusiness: Decimal.max(
          nextConfig.requiredBusiness.minus(
            nextConfig.qualificationPool === "DIRECT_ONLY" ? directBV : effectiveBV
          ),
          new Decimal(0)
        ).toFixed(8),
        monthlySalary:     nextConfig.monthlySalary.toFixed(2),
      }
    : null;

  return {
    userId:            user.id,
    username:          user.username,
    directBusiness:    directBV.toFixed(8),
    downlineBusiness:  user.salaryDownlineBusiness.toFixed(8),  // raw (not clamped)
    powerBusiness:     user.salaryPowerBusiness.toFixed(8),
    isUnlocked,
    unlockedAt:        goldAchievement?.achievedAt.toISOString() ?? null,
    effectiveBusiness: effectiveBV.toFixed(8),
    currentRank,
    nextRank,
    ranks: rankRows,
  };
}
```

### Notes

- `downlineBusiness` and `powerBusiness` in the response are **always the raw stored amounts**, even when locked. The frontend displays them with a lock indicator but shows the actual accumulated value.
- `effectiveBusiness` is the locked/unlocked-adjusted value — what the engine actually uses.
- No qualification computation happens in the frontend. The `ranks` array contains everything needed to render progress bars and status badges.

---

## Section 6 — Qualification Engine (Revised)

*(No change from Revision 1 except naming. Reproduced here for completeness.)*

### Rank groups

| Group | Ranks | `effectiveBusiness` uses |
|---|---|---|
| DIRECT_ONLY | Bronze, Silver, Gold | `salaryDirectBusiness` |
| ALL_BUSINESS | Platinum, Sapphire, Ruby, Emerald | `salaryDirectBusiness + salaryDownlineBusiness + salaryPowerBusiness` (when unlocked) |

### Unlock gate

The qualification engine calls `isTeamUnlocked(userId)` once per pass. No stored flag. No drift risk.

If `isTeamUnlocked() = false`:
- ALL_BUSINESS ranks evaluate against `salaryDirectBusiness` alone.
- A user with $100,000 in Downline Business but no Gold achievement cannot reach Platinum. This is intentional and correct.

---

## Section 7 — Member Dashboard (Revised)

The dashboard is a pure rendering layer. It calls `GET /api/salary/summary` and renders the response. No local qualification logic.

### Locked state

```
┌─────────────────────────────────────────────────┐
│  YOUR SALARY QUALIFICATION                      │
│  Current Rank:  SILVER                          │
├─────────────────────────────────────────────────┤
│  DIRECT BUSINESS                     $12,400    │
│  ██████████████████░░  Target: $15,000 (Gold)   │
│  Counts toward Bronze · Silver · Gold           │
├─────────────────────────────────────────────────┤
│  DOWNLINE BUSINESS     🔒  $8,200 accumulating  │
│  ────────────────────────────────────────────── │
│  Achieve Gold Salary Rank to unlock this pool   │
│  for Platinum and above.                        │
├─────────────────────────────────────────────────┤
│  POWER BUSINESS        🔒  $1,500 accumulating  │
│  ────────────────────────────────────────────── │
│  Achieve Gold Salary Rank to unlock this pool   │
│  for Platinum and above.                        │
├─────────────────────────────────────────────────┤
│  EFFECTIVE BUSINESS    $12,400                  │
│  (Direct only until Gold is achieved)           │
│  After Gold: $22,100 (+Downline +Power)         │
└─────────────────────────────────────────────────┘
```

### Unlocked state (Gold achieved)

```
├─────────────────────────────────────────────────┤
│  DOWNLINE BUSINESS     🔓  $8,200               │
│  ████████░░░░░░░░░░░  Contributing to Platinum+ │
├─────────────────────────────────────────────────┤
│  POWER BUSINESS        🔓  $1,500               │
│  ███░░░░░░░░░░░░░░░░  Contributing to Platinum+ │
├─────────────────────────────────────────────────┤
│  EFFECTIVE BUSINESS    $22,100                  │
│  Next rank: Platinum  ·  Need $50,000           │
│  Remaining: $27,900                             │
│  (from nextRank.remainingBusiness in API)       │
└─────────────────────────────────────────────────┘
```

All amounts are always visible. Lock/unlock affects contribution to qualification — not visibility.

---

## Section 8 — Performance

Recommendation is unchanged from Revision 1: **incremental counters**.

The unlock check is now a single indexed DB lookup instead of a boolean read — the performance difference is negligible (< 1ms on a properly indexed table). The benefit is the complete elimination of a second source of truth.

The `GET /api/salary/summary` endpoint performs:
1. One `user.findUniqueOrThrow` — O(1).
2. One `salaryAchievement.findMany` — O(achievements per user, typically ≤ 8).
3. One `salaryRankConfig.findMany` — O(ranks, always ≤ 8); can be cached in SystemSettings/Redis if needed.

Total: 3 queries, all indexed. No aggregation. No downline traversal. Suitable for a member-facing dashboard endpoint.

---

## Section 9 — Edge Cases

*(Unchanged from Revision 1; reproduced with revised naming.)*

| Scenario | Handling |
|---|---|
| Refund / cancellation | Subtract from Direct or Downline pool; floor at 0; log anomaly if negative would result |
| Power BV removal | Subtract from `salaryPowerBusiness`; floor at 0 |
| Member suspended | Counters preserved; no new achievements; existing achievements continue paying |
| Member reactivated | No recalculation needed; counters were never cleared |
| Historic Gold achievement | `isTeamUnlocked()` returns true immediately via `SalaryAchievement` lookup |
| Duplicate events | `@@unique([userId, pool, referenceId, eventType])` prevents double-write |
| Cron retry | Idempotent by design; P2002 on duplicate is swallowed, counter not changed |
| Race conditions | All counter writes use `increment`/`decrement` (atomic in PostgreSQL) |
| Sponsor chain loop | Walk capped at depth 50; alert logged if cap hit |
| Counter goes negative | Clamped to 0; anomaly written to AdminLog for manual review |
| Power removal exceeds balance | `removePowerBV` service guards against this; `salaryPowerBusiness` floored at 0 separately |

---

## Section 10 — Revised Implementation Roadmap

### Sprint 33D — Database

**Schema changes:**
- Add `salaryDirectBusiness`, `salaryDownlineBusiness`, `salaryPowerBusiness` to `User` (Decimal, default 0).
- ~~`salaryTeamUnlocked`~~ — **not added** (removed per Revision 2).
- ~~`salaryGoldAchievedAt`~~ — **not added** (removed per Revision 2).
- Create `SalaryBusinessEvent` model with `SalaryPool` and `SalaryEventType` enums.
- Add `qualificationPool SalaryQualificationPool` to `SalaryRankConfig`.
- Create `SalaryQualificationPool` enum with values `DIRECT_ONLY` and `ALL_BUSINESS`.
- Named migration: `salary_pools_v1`.

**Seed update:**
- Set `qualificationPool` on all 7 rank config rows (Bronze/Silver/Gold → DIRECT_ONLY; Platinum+ → ALL_BUSINESS).
- Null out `powerLegRequired` and `weakLegRequired` on all rows.

---

### Sprint 33E — Backend Salary Business Service

New file: `salary/salary-business.service.ts`
- `creditDirectBusiness(investmentId, investorId, amount, tx)` — walks depth-1 sponsor, increments counter, writes event.
- `creditDownlineBusiness(investmentId, investorId, amount, tx)` — walks depth-2+ ancestors, increments counters, writes events.
- `debitDirectBusiness(investmentId, investorId, amount)` — cancellation/refund mirror.
- `debitDownlineBusiness(investmentId, investorId, amount)` — cancellation/refund mirror.
- `creditPowerBusiness(powerBvLedgerId, userId, adminId, amount, tx)` — user-only, no propagation.
- `debitPowerBusiness(powerBvLedgerId, userId, adminId, amount)` — floor at 0.

New file: `salary/salary-qualification.service.ts`
- `isTeamUnlocked(userId, tx)` — indexed lookup, returns boolean.
- `computeEffectiveBusiness(user, unlocked, pool)` — pure function.
- `computeQualification(userId)` — full qualification pass in a transaction.
- `getSalarySummary(userId)` — powers the new API endpoint.

Hook into existing services:
- `investments.service.ts` → call `creditDirectBusiness` + `creditDownlineBusiness` on investment creation; call debit variants on cancellation/refund.
- `power-bv.service.ts` → call `creditPowerBusiness` on addPowerBV; call `debitPowerBusiness` on removePowerBV.

---

### Sprint 33F — Salary Scheduler

- Update salary qualification cron to call `computeQualification(userId)` for all active users.
- Payout cron unchanged (uses `SalaryAchievement` + `SalaryIncome` — no changes needed).
- Add nightly reconciliation cron: re-aggregate from `SalaryBusinessEvent` per user and compare to counter; alert on drift > $0.01.
- Remove old `SalaryBvLedger` writes from `investments.service.ts`.

---

### Sprint 33G — Admin UI

- New "Salary Business" tab in `MemberDrawer` (after existing Salary tab):
  - Pool counters: Direct, Downline, Power (raw amounts).
  - Unlock status: derived (shows Gold achievement date or "Not yet").
  - `SalaryBusinessEvent` audit log: paginated, filterable by pool/eventType.
- Update `SalaryRankConfig` admin editor:
  - Add `qualificationPool` selector (dropdown: DIRECT_ONLY / ALL_BUSINESS).
  - Remove `powerLegRequired` and `weakLegRequired` input fields.
- Optional: "Recalculate qualification" button — triggers `computeQualification(userId)` for one user.

---

### Sprint 33H — Member UI

- New "Salary Qualification" card on member dashboard.
- Calls `GET /api/salary/summary`.
- Renders: current rank badge, Direct Business progress bar, Downline Business (locked or unlocked), Power Business (locked or unlocked), Effective Business, next rank progress.
- Zero qualification logic in the frontend — all values come from the API response.

---

### Sprint 33I — Testing

- Unit tests for `isTeamUnlocked`, `computeEffectiveBusiness`, `computeQualification` (pure or lightly mocked).
- Integration tests: investment creation → counter update → qualification → achievement.
- Edge case tests: refund/cancel, Power BV remove, suspension, retry idempotency.
- Cron idempotency: run qualification pass twice; verify no duplicate achievements.
- API tests: `GET /api/salary/summary` response shape for locked/unlocked/no-rank users.

---

### Sprint 33J — Migration

1. Run named migration `salary_pools_v1` on production.
2. Backfill `salaryDirectBusiness`: scan investments → depth-1 sponsor credits (batch 200).
3. Backfill `salaryDownlineBusiness`: scan investments → depth-2+ ancestor credits (batch 200).
4. `salaryPowerBusiness` = 0 for all users (Power BV is new; no historical grants).
5. Verify 10% random sample: re-aggregate from `SalaryBusinessEvent` vs. User counters.
6. Update `SalaryRankConfig.qualificationPool` seed values.
7. Enable new qualification engine; disable `SalaryBvLedger` writes.
8. Monitor 48 hours; reconciliation cron provides ongoing confidence.

---

## Summary of all architecture decisions

| Decision | Adopted approach |
|---|---|
| Pool names | `salaryDirectBusiness`, `salaryDownlineBusiness`, `salaryPowerBusiness` |
| Unlock state storage | **None on User** — derived from `SalaryAchievement WHERE rankName = 'Gold'` |
| Qualification pool enum | `DIRECT_ONLY` \| `ALL_BUSINESS` |
| Propagation chain | Sponsor chain (`sponsorId`), NOT binary tree |
| Counter storage | Three Decimal columns on User — O(1) reads |
| Audit trail | `SalaryBusinessEvent` immutable append-only log |
| Deduplication | `@@unique([userId, pool, referenceId, eventType])` |
| Gold unlock | One-way via `SalaryAchievement` record; never reverts; no extra flag |
| Rank revocation | Never — cumulative milestone model preserved |
| Power Business propagation | None — direct user credit only |
| Live vs. incremental | Incremental counters; nightly drift reconciliation |
| Frontend calculation | None — `GET /api/salary/summary` returns pre-computed state |
| Migration approach | Additive schema → batch backfill → verify → enable new engine |
| `SalaryBvLedger` | Preserved (read-only); deprecated in future cleanup sprint |
