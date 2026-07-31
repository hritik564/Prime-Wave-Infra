---
name: Rank names case and tier mismatch in MemberDrawer
description: The DB salary rank names use title-case strings; the frontend Rank type must match exactly or RANK_NEXT lookup returns undefined and crashes the drawer.
---

## The rule
The `SalaryRankConfig.rankName` column stores title-case strings. The full ordered list is:
`'Bronze', 'Silver', 'Gold', 'Platinum', 'Sapphire', 'Ruby', 'Emerald', 'Diamond', 'Ambassador', 'Sovereign Crown'`

The frontend `Rank` type in `MemberDrawer.tsx` must match these exactly (title-case, full list). `RANK_NEXT` must cover all 10 entries.

**Why:** Any member with an active salary achievement whose `rankName` is not in `RANK_NEXT` causes `rankNext.next` to throw a TypeError, crashing the entire member drawer for that user. Was previously typed as only 4 uppercase values (`"BRONZE" | "SILVER" | "GOLD" | "DIAMOND"`), matching nothing in the actual DB.

**How to apply:** If new ranks are added to `salary_rank_config`, update the `Rank` union type and `RANK_NEXT` map in `MemberDrawer.tsx` to match. Always keep a `?? { next: "—", progress: 0 }` fallback on the `RANK_NEXT` lookup as a safety net. Use `rankTier()` (ordinal index) for salary/benefit logic rather than hardcoded rank-name comparisons.
