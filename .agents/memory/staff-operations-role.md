---
name: Staff Operations role
description: Least-privilege staff role and session invalidation design for Prime Wave admin access
---

`STAFF_OPERATIONS` is a distinct admin role. It has read/support access to operational pages, while approval, credit, rejection, payment, reprocessing, adjustment, engine control, treasury, blockchain, impersonation, and settings remain restricted.

**Why:** The role must be deployable without changing existing admin accounts and must invalidate old admin JWTs after role or activation changes.

**How to apply:** Keep the current admin `updatedAt` timestamp in the JWT and revalidate account existence, active state, role, and timestamp on protected admin requests. Add future permissions at both route and UI layers.