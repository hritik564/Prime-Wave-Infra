# Sprint 33C Revision 3 — Final Architecture Review
## Salary Business Counters: User Table vs. Dedicated Table

**Status:** Design Only — No production code changes.
**Supersedes:** `salary-architecture-33c-r2.md` (Revision 2)

---

## The Question

Should the three salary business counters be stored as columns on the `User` table (**Option A**), or in a dedicated 1-to-1 table `SalaryBusinessSummary` (**Option B**)?

---

## Decisive Precedent from the Existing Codebase

Before the 10-dimension comparison, one observation is important enough to state first.

The codebase **already answered this question** for financial counters. The `Wallet` table (lines 224–255 of schema.prisma) is a dedicated 1-to-1 table holding `depositWallet`, `incomeWallet`, and `withdrawalWallet` rather than columns on `User`. This was a deliberate architectural choice made early in the project.

```
User
 └── wallet  Wallet?        ← financial balances live here, not on User
 └── salaryAchievements     ← salary outcomes live here
 └── salaryIncome           ← salary payouts live here
```

`salaryDirectBusiness`, `salaryDownlineBusiness`, and `salaryPowerBusiness` are salary-domain financial counters. The established codebase pattern places them in their own table, exactly as `Wallet` is their own table. This consistency argument alone is strong, but the 10-dimension analysis below confirms the same conclusion independently.

---

## The 10-Dimension Comparison

### 1. Read Performance

**Option A — User table**
Reading salary counters is "free" when the User row is already being fetched for auth or profile purposes. One row, one read.

**Option B — SalaryBusinessSummary**
Requires a second indexed lookup (`WHERE user_id = ?`, PK-keyed) or a single JOIN. Either is O(1) on an indexed PK.

**Verdict: Negligible practical difference.**
The salary qualification check and the `GET /api/salary/summary` endpoint fetch only salary data — they don't need the full User row. For those call paths, Option B's dedicated table is actually the more focused query. When auth middleware already has the User row in memory, a second indexed lookup for salary data adds sub-millisecond latency. Not a meaningful consideration either way.

---

### 2. Write Performance and Lock Contention

**Option A — User table**
Every investment event that triggers salary counter updates writes to the User row. The User row is a **hot row** — it is also written by:
- Binary matching cycle (leftBV, rightBV, powerLeftBV, powerRightBV)
- Profile updates (firstName, lastName, phone, walletAddress)
- Binary tree placement (binaryParentId, leftDeepestNodeId, rightDeepestNodeId)
- Status changes
- Referral counter increments (directReferralCount, directLeftCount, directRightCount)

All of these compete for the **same row-level lock** in PostgreSQL. Under concurrent investment activity — which is exactly the scenario at the peak of a cron cycle — salary writes queue behind binary BV writes and vice versa.

**Option B — SalaryBusinessSummary**
Salary counter writes go to a separate table. They only contend with other salary writes. Binary BV updates (matching cycle), profile changes, and tree placement operations never block salary counter increments and vice versa.

**Verdict: Option B has materially better write concurrency.**
In a network where hundreds of investment events fire within a short window, reducing lock contention on the User row is a real operational improvement, not a theoretical one.

---

### 3. Transaction Complexity

**Option A — User table**
Investment creation, salary counter increment, and SalaryBusinessEvent write can all touch the User table in one transaction. Conceptually simple.

**Option B — SalaryBusinessSummary**
Investment creation transaction must also update `SalaryBusinessSummary`. This adds one model to the transaction. The query is `tx.salaryBusinessSummary.upsert(...)` — not materially more complex.

**Verdict: Equivalent.**
Both options involve the same number of logical operations. Option B's transaction touches one additional model, but it is a single indexed write. The qualification engine already reads from multiple tables (`User`, `SalaryAchievement`, `SalaryRankConfig`) — one more model is not a burden.

---

### 4. Database Normalization

**Option A — User table**
The current `User` model mixes:
- **Identity** (email, username, passwordHash, phone)
- **Session metadata** (walletAddress, telegramId, profileImage)
- **Binary tree structure** (position, binaryParentId, leftDeepestNodeId, rightDeepestNodeId)
- **Binary BV counters** (leftBV, rightBV, powerLeftBV, powerRightBV)
- **Referral counters** (directReferralCount, directLeftCount, directRightCount)
- **Salary counters** (proposed: salaryDirectBusiness, salaryDownlineBusiness, salaryPowerBusiness)

This is a multi-domain table. Adding salary counters deepens the violation of first normal form intent — each table should represent one entity with coherent attributes.

**Option B — SalaryBusinessSummary**
Salary domain state lives in a salary table. User contains identity and structural relations. Each table has a single, clear domain.

**Note on the binary BV fields:**
`leftBV`, `rightBV`, `powerLeftBV`, `powerRightBV` are already on User. They represent an existing trade-off made because the binary matching cycle performs a bulk `findMany` over all qualifying users, selecting those fields in a single table scan with a compound WHERE clause. They are accessed in bulk across all users simultaneously. Salary counters have a different access pattern — they are read per-user during individual qualification checks, not in bulk scans. The binary BV fields are on User for a specific performance reason; the salary counters do not share that reason.

**Verdict: Option B is better normalized.**

---

### 5. Future Scalability

**Option A — User table**
Adding more salary-related counters (e.g., `salaryTotalLifetimePaid`, `salaryRankSnapshotDate`, `salaryCurrentRankName`, team-size metrics) requires ALTER TABLE on the largest, most-written table in the entire system. Each addition widens the hot row, increasing the size of every table scan that touches User.

**Option B — SalaryBusinessSummary**
New salary fields are added to `SalaryBusinessSummary`. The User table remains stable. The salary schema evolves independently. In the future, the salary domain could add fields like:
- `salaryLastQualifiedAt`
- `salaryCurrentRankName` (cached from latest achievement)
- `salaryTotalIncomePaid`
- `salaryQualificationSnapshotAt`

None of these would ever need to touch User.

**Verdict: Option B scales significantly better.**

---

### 6. Maintainability

**Option A — User table**
A developer working on salary qualification logic must import and modify the `User` model. Any migration that restructures `User` (e.g., renaming fields, changing indexes, adding constraints) carries the risk of affecting salary logic. The blast radius of changes to `User` is the entire application.

**Option B — SalaryBusinessSummary**
The salary business service touches `SalaryBusinessSummary`, `SalaryBusinessEvent`, `SalaryAchievement`, and `SalaryIncome`. It never needs to touch `User` directly (except for reading status and the sponsor chain, which is appropriate). A developer working exclusively on salary logic can understand the entire salary domain without needing to understand the binary tree, wallet system, or notification system.

**Verdict: Option B is substantially more maintainable.**

---

### 7. Separation of Concerns

**Option A — User table**
`User` becomes responsible for identity, authentication, binary tree state, referral tree state, AND salary domain state. Four distinct concerns in one table.

**Option B — SalaryBusinessSummary**
```
User                     ← identity, auth, tree structure
 └── Wallet              ← financial balances (existing pattern)
 └── SalaryBusinessSummary  ← salary domain counters (new, matching Wallet pattern)
     └── SalaryBusinessEvent   ← immutable audit log
     └── SalaryAchievement     ← rank milestones
     └── SalaryIncome          ← monthly payouts
```

The entire salary domain is self-contained. A future service boundary (e.g., extracting salary into a separate microservice) would only need to reach into `SalaryBusinessSummary` and its downstream tables — not `User`.

**Verdict: Option B cleanly separates concerns. This is the architecturally correct design.**

---

### 8. Migration Complexity

**Option A — User table**
One `ALTER TABLE users ADD COLUMN` (×3). Backfill runs as `UPDATE users SET ...`. Very straightforward.

**Option B — SalaryBusinessSummary**
One `CREATE TABLE salary_business_summary`. One `INSERT INTO salary_business_summary SELECT id, 0, 0, 0, now() FROM users` to create a summary row for every existing user. Backfill runs as `UPDATE salary_business_summary SET ...`.

**Verdict: Option A is marginally simpler, but the difference is one additional SQL statement.**
Option B's migration is a single bulk INSERT followed by batch UPDATEs — no more complex than Option A in practice. This is a one-time cost. It does not justify choosing Option A.

---

### 9. Reporting and Analytics

**Option A — User table**
Salary aggregate queries (`AVG(salaryDirectBusiness)`, `COUNT(*) WHERE salaryDirectBusiness > threshold`, salary funnel analysis) scan the User table — the widest, most-written table in the system. These analytical queries compete with OLTP reads/writes on the same table.

**Option B — SalaryBusinessSummary**
Salary analytics run on a focused, narrow table with exactly three decimal columns and a timestamp. Analytical queries are faster (smaller row size = more rows per page), and they do not compete with User-table OLTP operations.

**Verdict: Option B is materially better for reporting and analytics.**

---

### 10. Long-Term Architecture

The salary domain currently consists of: `SalaryBvLedger`, `SalaryRankConfig`, `SalaryAchievement`, `SalaryIncome`, and the proposed `SalaryBusinessEvent`. Adding `SalaryBusinessSummary` completes a fully self-contained salary namespace:

```
Salary domain:
  SalaryRankConfig          ← configuration
  SalaryBusinessSummary     ← live counters (source of truth for qualification)
  SalaryBusinessEvent       ← immutable audit trail
  SalaryAchievement         ← earned milestones
  SalaryIncome              ← payout records
  SalaryBvLedger            ← legacy (read-only, to be deprecated)
```

Every salary table is prefixed `Salary`. Every salary concept has a home. `User` contains only a reference relation (`salaryBusinessSummary SalaryBusinessSummary?`) just as it contains `wallet Wallet?`.

This mirrors the financial wallet pattern already in the codebase. It mirrors the `Wallet` design decision made at the start of the project. It is the consistent, predictable choice.

**Verdict: Option B is the correct long-term architecture.**

---

## Summary Scorecard

| Dimension | Option A (User table) | Option B (SalaryBusinessSummary) |
|---|---|---|
| 1. Read performance | ≈ Equivalent | ≈ Equivalent |
| 2. Write performance / lock contention | ❌ Hot row, more contention | ✅ Isolated writes |
| 3. Transaction complexity | ✅ Marginally simpler | ≈ Equivalent |
| 4. Database normalization | ❌ Multi-domain table | ✅ Clean domains |
| 5. Future scalability | ❌ Widens hot table | ✅ Domain evolves independently |
| 6. Maintainability | ❌ Coupled to User | ✅ Isolated, clear |
| 7. Separation of concerns | ❌ Mixed concerns | ✅ Clean SoC |
| 8. Migration complexity | ✅ One statement simpler | ≈ One statement more |
| 9. Reporting / analytics | ❌ Wide-table scans | ✅ Focused table |
| 10. Long-term architecture | ❌ Continues widening | ✅ Consistent with Wallet pattern |

**Option B wins 7 dimensions. Option A wins 1 dimension (marginally). 2 are equivalent.**

---

## Recommendation: **Option B — `SalaryBusinessSummary` dedicated table**

### Reasoning

**1. The Wallet precedent is decisive.**
The codebase already made this architectural decision. `depositWallet`, `incomeWallet`, and `withdrawalWallet` are not columns on `User` — they live in `Wallet`. These are financial counters for a specific domain, exactly as `salaryDirectBusiness`, `salaryDownlineBusiness`, and `salaryPowerBusiness` are financial counters for the salary domain. Placing salary counters in `SalaryBusinessSummary` is not a new pattern — it is applying the existing pattern consistently.

**2. The User table is already wide.**
The current `User` model spans 30+ columns across four distinct concerns. Every additional column increases row size, page pressure, index weight, and the cognitive load of understanding the model. This is not a subjective concern — PostgreSQL's row storage and vacuuming are directly affected by table width, particularly for frequently-updated rows.

**3. Lock contention is a real production concern.**
The matching cycle updates `leftBV`, `rightBV`, `powerLeftBV`, `powerRightBV` on User. Investment creation updates binary tree counts. Sponsor-chain salary propagation would update salary counters on every ancestor's User row. These three write paths competing for the same row locks is an unnecessary bottleneck. `SalaryBusinessSummary` eliminates this entirely.

**4. The migration cost is one additional SQL statement.**
Option B's migration requires a bulk INSERT to create summary rows for all existing users. This is trivially parallelizable and runs in seconds for any realistic dataset. This one-time cost is not a valid reason to choose the architecturally inferior option.

**5. Long-term product evolution favours isolation.**
Prime Wave will grow. The salary system will gain more fields — cached rank names, last qualification dates, lifetime payout totals, team-size metrics. Every future salary field should land in `SalaryBusinessSummary`, not in `User`. Establishing this boundary now is the correct decision.

---

## Revised Database Diagram

### New table: `SalaryBusinessSummary`

```prisma
model SalaryBusinessSummary {
  userId             String   @id                    -- 1-to-1 with User; PK is the FK
  directBusiness     Decimal  @default(0) @db.Decimal(18, 8)
  downlineBusiness   Decimal  @default(0) @db.Decimal(18, 8)
  powerBusiness      Decimal  @default(0) @db.Decimal(18, 8)
  updatedAt          DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("salary_business_summary")
}
```

**Design choices:**
- `userId` is both the PK and the FK — a 1-to-1 relationship with no surrogate key needed. Lookup is always by userId; using it as the PK eliminates a separate unique index.
- `onDelete: Cascade` — when a User is deleted, their salary summary is deleted automatically.
- `updatedAt @updatedAt` — Prisma auto-timestamps on every write; useful for drift detection in the nightly reconciliation cron.
- No `createdAt` needed — `SalaryBusinessEvent` has the full creation history.

### Updated `User` model (relations only — no new columns)

```prisma
model User {
  // ... all existing columns unchanged ...

  // Salary (relations only — no counter columns on User)
  salaryBusinessSummary SalaryBusinessSummary?   // ← new relation
  salaryAchievements    SalaryAchievement[]       // ← unchanged
  salaryIncome          SalaryIncome[]            // ← unchanged
}
```

`User` gains exactly one new relation and zero new columns.

### Full salary domain diagram

```
User (identity, auth, tree structure)
 │
 ├── Wallet (1:1)                     depositWallet / incomeWallet / withdrawalWallet
 │
 └── SalaryBusinessSummary (1:1)      directBusiness / downlineBusiness / powerBusiness
      │
      ├── SalaryBusinessEvent (1:N)   immutable audit log of all pool deltas
      │
      ├── SalaryAchievement (1:N)     earned rank milestones (unchanged)
      │    └── SalaryRankConfig       rank configuration (unchanged)
      │
      └── SalaryIncome (1:N)          monthly payout records (unchanged)
```

Note: `SalaryBusinessSummary` does not have foreign keys to `SalaryBusinessEvent`, `SalaryAchievement`, or `SalaryIncome` — those tables relate directly to `User`. The diagram shows the logical domain hierarchy, not FK chains.

---

## Impact on Previously Approved Documents

### `salary-architecture-33c-r2.md` (Revision 2) — changes required

| Section | Change |
|---|---|
| Section 1 — Data Model | Replace "New columns on User" with "New table: SalaryBusinessSummary". Remove mention of User columns. |
| Section 2 — Event flows | All `user.salaryDirectBusiness +=` → `summary.directBusiness +=` etc. |
| Section 3 — Qualification engine | `user.salaryDirectBusiness` → `summary.directBusiness` etc. `getSalarySummary()` fetches from `salaryBusinessSummary` join, not directly from `user`. |
| Section 4 — Lock/Unlock | Prose unchanged; only field references updated |
| Section 5 — API response | `getSalarySummary()` fetches `salaryBusinessSummary` via `prisma.salaryBusinessSummary.findUniqueOrThrow({ where: { userId } })` |
| Section 10 — Sprint 33D | Add `CREATE TABLE salary_business_summary` + bulk INSERT migration step |

All other sections (sponsor-chain propagation, incremental counters, SalaryBusinessEvent, qualification pool enum, unlock derivation, migration strategy, nightly reconciliation) **remain fully approved and unchanged**.

---

## Final Confirmed Architecture (All Decisions)

| Decision | Confirmed approach |
|---|---|
| Salary counter location | **`SalaryBusinessSummary` dedicated 1:1 table** (Option B) |
| Pool names | `directBusiness`, `downlineBusiness`, `powerBusiness` (on SalaryBusinessSummary) |
| User table impact | Zero new columns; one new relation `salaryBusinessSummary` |
| Unlock state | Derived from `SalaryAchievement WHERE rankName = 'Gold'` — no stored flag |
| Qualification pool enum | `DIRECT_ONLY` \| `ALL_BUSINESS` |
| Propagation chain | Sponsor chain (`sponsorId`), not binary tree |
| Counter pattern | Incremental `increment`/`decrement` operators (atomic) |
| Audit trail | `SalaryBusinessEvent` — immutable, deduplicated by `@@unique` |
| Gold unlock | One-way — Gold `SalaryAchievement` existence is the gate |
| Rank revocation | Never — cumulative milestone model preserved |
| Power Business propagation | None — direct user grant only |
| Live vs. incremental | Incremental counters; nightly drift reconciliation |
| Frontend calculation | None — `GET /api/salary/summary` returns pre-computed state |
| Migration | Additive schema → bulk INSERT for all users → batch backfill → verify → enable |
| `SalaryBvLedger` | Preserved read-only; deprecated in future cleanup sprint |
