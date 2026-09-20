---
name: Bulk reset timestamp invariant
description: Why the bulk password reset preserves a normal user’s generic updatedAt timestamp
---

The bulk password reset must change only authentication fields on normal users. Preserve the existing `updatedAt` value explicitly in the conditional update; Prisma otherwise advances it automatically.

**Why:** The Stage 4B rehearsal treats wallet, network, identity, and non-authentication user fields as invariants. A first development run exposed `updatedAt` drift even though all business fields were unchanged.

**How to apply:** Keep `updatedAt` selected with each reset candidate and pass that original value in the update. Validate this in service tests and in any future database rehearsal.