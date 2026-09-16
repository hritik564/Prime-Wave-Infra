---
name: Withdrawal business-state boundary
description: Admin withdrawal processing separates internal worker states from business actions and refund decisions.
---

The withdrawal worker claims aged PENDING requests automatically, while retaining APPROVED compatibility for legacy records, and moves both into internal QUEUED. A reliable pre-signing failure returns to PENDING without changing wallet balances or creating a refund ledger entry; only an explicit admin rejection refunds. Any signing/broadcast ambiguity stays protected and requires reconciliation.

**Why:** The normal workflow no longer has an approval gate, but the existing claim lock, validation boundary, and explicit refund protections must remain unchanged; legacy APPROVED records still need to process safely.

**How to apply:** Keep the age/hold cutoff, atomic claim ownership, PENDING → QUEUED transition, admin action guards, status filters, failure classification, and timeline assertions aligned with this boundary.