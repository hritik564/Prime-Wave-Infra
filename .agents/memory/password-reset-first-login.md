---
name: Password-reset first login
description: Security boundary for users whose passwordResetRequired flag is true after a bulk replacement
---

Users with passwordResetRequired=true must prove the temporary password with bcrypt before receiving a restricted password-change credential. That credential must be short-lived, purpose-specific, rejected by normal authenticated routes, and invalidated by the normal authVersion increment after the new password is saved.

**Why:** A login gate placed before bcrypt verification deadlocks bulk-reset users, while a normal JWT would grant access before they establish a new password.

**How to apply:** Keep the restricted credential accepted only by the password-change route; return a normal user session only after the password change clears passwordResetRequired and increments authVersion.