---
name: FULL_REPLACEMENT run membership
description: Completed full-replacement reset runs retain aggregate progress, not a durable per-user membership set.
---

Completed FULL_REPLACEMENT password-reset runs persist run-level totals, a final cursor, timestamps, and an aggregate admin audit record. They do not persist per-user ownership, so timestamp windows and current population snapshots cannot safely reconstruct an authoritative historical membership set.

**Why:** The worker processes users by an ordered cursor and updates users independently; checkpoints only record the last cursor and aggregate count. A shared password-change timestamp can also be produced by another reset path.

**How to apply:** Treat any one-time marker backfill for an already-completed run as unproven unless an independent immutable per-user source exists. Do not infer ownership from passwordChangedAt alone.