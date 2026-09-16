---
name: Locked-balance forensic limitation
description: Aggregate lockedWithdrawalBalance has no per-withdrawal history, so historical gaps cannot be assigned from current balances alone.
---

The wallet stores one aggregate `lockedWithdrawalBalance`; normal lock increments/decrements do not create an immutable per-withdrawal balance audit. FinancialLedger records available withdrawal-wallet debits/credits, not lock ownership.

**Why:** Historical processor failure/refund logic can credit the full withdrawal amount while releasing only the locked amount that exists at the time. Admin resets can also overwrite the aggregate. Current balances and request amounts cannot identify which request absorbed a historical gap when multiple requests overlap.

**How to apply:** Before any production rejection/refund, reconcile all active requests for the user and require a persisted accounting record or explicit manual classification for any difference between active-request total and aggregate locked balance. Do not allocate a residual to a request solely by arithmetic.

Historical duplicate confirmation handling is a concrete source of over-release: the published completion path could complete the same request twice for one transaction hash, creating two wallet transactions and decrementing the aggregate lock twice. The guarded conditional completion path is required.

**Why:** A confirmation poll can observe the same successful chain transaction more than once. Without a source-state/txHash conditional update, the second observation repeats the wallet side effect even though the request is already terminal.

**How to apply:** Search for duplicate wallet withdrawals by request ID and transaction hash before reconciling a short lock; treat the extra release as an internal reclassification, not as a new user withdrawal or refund.