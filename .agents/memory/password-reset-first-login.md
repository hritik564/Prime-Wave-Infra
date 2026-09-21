---
name: Password-reset first login
description: Security boundary for users whose passwordResetRequired flag is true after a bulk replacement
---

Users with passwordResetRequired=true must prove the temporary password with bcrypt before receiving a restricted password-change credential, except for users whose password was established during a completed FULL_REPLACEMENT run. Those users authenticate normally once and clear the flag atomically.

**Why:** A login gate placed before bcrypt verification deadlocks ordinary reset users, while the completed full-replacement audit window is the only existing durable marker that distinguishes replacement users without a schema migration.

**How to apply:** Match passwordChangedAt against a completed FULL_REPLACEMENT run's startedAt/completedAt window, then conditionally clear only passwordResetRequired and increment authVersion. Keep unrelated reset flows restricted and purpose-bound.