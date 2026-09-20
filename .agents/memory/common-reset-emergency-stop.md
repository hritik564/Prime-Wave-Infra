---
name: Common reset emergency stop
description: Safety rules for stopping the development common-password reset worker during performance recovery
---

The emergency stop must be cooperative: set a run-scoped in-memory cancellation flag, let all currently active user operations settle, prevent new user work, skip any incomplete-batch checkpoint, then atomically transition only the approved RUNNING run to FAILED with the recovery reason.

**Why:** The temporary password exists only in process memory, and forcibly terminating the worker could interrupt an in-flight credential update or lose the ability to complete the controlled transition. The durable checkpoint must remain resumable and idempotent.

**How to apply:** Keep the control SUPER_ADMIN-only, require explicit confirmation, reject every run except the approved recovery target, and report that immediate recovery is unavailable when the worker context is not alive in the current process. Never perform this recovery automatically from production startup or lease expiry.