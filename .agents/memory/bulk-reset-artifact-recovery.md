---
name: Bulk reset artifact recovery
description: Safe relationship between private credential artifacts and bulk authentication updates
---

The private credential artifact is the recovery source of truth for a bulk password reset: persist each prepared mapping before changing the user, mark it committed only after the hash update succeeds, and reconcile prepared records by bcrypt comparison after a crash.

**Why:** Database updates and object-storage writes cannot share one transaction; a process can stop between either step, and generating a replacement password on resume would break user-to-credential mapping.

**How to apply:** Keep plaintext only in the private, expiring, one-time artifact and transient memory. Store only run metadata and checkpoint counts in PostgreSQL, and never resume by blindly generating new passwords.