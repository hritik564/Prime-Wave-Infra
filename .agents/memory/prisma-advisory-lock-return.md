---
name: Prisma advisory lock return type
description: Non-obvious failure mode when using PostgreSQL transaction-scoped advisory locks through Prisma
---

`pg_advisory_xact_lock(...)` returns PostgreSQL `void`. A Prisma `$queryRaw` call that selects this function can fail while deserializing the result, before the callback that performs signing or broadcasting runs.

**Why:** A production withdrawal reached the processor's `BROADCASTING` state, but the distributed nonce-lock query failed before the BSC gateway logged gas/nonce retrieval or signing. The processor conservatively classified the outcome as ambiguous even though no raw transaction was created or submitted.

**How to apply:** When reviewing or changing distributed nonce locking, make the advisory-lock query return a Prisma-supported scalar/result shape or otherwise consume it safely. Keep forensic reasoning separate from the business state's conservative ambiguity classification.