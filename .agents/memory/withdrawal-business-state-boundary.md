---
name: Withdrawal business-state boundary
description: Admin withdrawal processing separates internal worker states from business actions and refund decisions.
---

The withdrawal worker must claim only APPROVED requests, move them to internal QUEUED, and expose QUEUED plus later active phases as business PROCESSING. A reliable pre-signing failure returns to PENDING without changing wallet balances or creating a refund ledger entry; only an explicit admin rejection refunds. Any signing/broadcast ambiguity stays protected and requires reconciliation.

**Why:** Treating PENDING as worker-eligible caused processor failures to bypass approval and made an automatic refund path unsafe.

**How to apply:** Keep worker claims, admin action guards, status filters, failure classification, and timeline assertions aligned with this boundary.