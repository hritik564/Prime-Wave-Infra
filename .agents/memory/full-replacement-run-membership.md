---
name: FULL_REPLACEMENT run membership
description: Completed full-replacement reset runs retain aggregate progress, not a durable per-user membership set.
---

Completed FULL_REPLACEMENT password-reset runs persist run-level totals, a final cursor, timestamps, and an aggregate admin audit record. They do not persist per-user ownership, so timestamp windows and current population snapshots cannot safely reconstruct an authoritative historical membership set.

**Why:** The worker processes users by an ordered cursor and updates users independently; checkpoints only record the last cursor and aggregate count. A shared password-change timestamp can also be produced by another reset path.

**How to apply:** Treat any one-time marker backfill for an already-completed run as unproven unless an independent immutable per-user source exists. Do not infer ownership from passwordChangedAt alone.

Production evidence can exclude recorded concurrent bulk, token-based, and admin operations, but cannot absolutely exclude an unaudited self-service password change because that path writes User.passwordHash without an admin-log record.

**Why:** The self-service change-password path has no durable operation record, while token-based resets leave token-consumption evidence and admin resets leave admin-log evidence.

**How to apply:** Report absence of competing recorded operations separately from proof that no unlogged password write occurred.