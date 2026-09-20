---
name: Development rehearsal workers
description: Background development workers can mutate synthetic financial records during long rehearsals
---

Development cron and queue workers remain active during API rehearsals and can process synthetic queued withdrawals or recompute binary-tree metadata independently of the feature under test.

**Why:** A rehearsal fixture with a pending withdrawal and binary relationships changed after API restarts, outside the bulk reset path, making a later post-auth snapshot misleading.

**How to apply:** Snapshot immediately before and after the feature operation, avoid worker-eligible fixture states where possible, and separate feature invariants from later authentication-flow or cleanup activity.