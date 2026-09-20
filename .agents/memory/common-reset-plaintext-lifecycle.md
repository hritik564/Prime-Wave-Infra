---
name: Common reset plaintext lifecycle
description: Security and recovery rule for the common temporary-password reset operation
---

The common temporary password must exist only in the in-memory worker context while the run is processing. A process restart cannot recover it; stale runs become failed and a Super Admin must securely re-enter the password to resume.

**Why:** Persisting plaintext or a reversible password-derived value would violate the operation’s security boundary, while pretending a restarted worker can resume would risk silently changing the wrong credentials.

**How to apply:** Keep run rows limited to progress, lease, status, and safe audit metadata. Make resume accept the password again, and use idempotent password/time checks so a partially completed batch can be replayed without double-incrementing `authVersion`.