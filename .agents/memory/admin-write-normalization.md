---
name: Admin write paths must normalize identifiers the same way as user-facing writes
description: Any admin/back-office endpoint that writes a field also used for login/lookup (username, email) must apply identical normalization (trim + lowercase) as the original creation path.
---

Admin edit endpoints (e.g. `adminUpdateUser`) must trim and lowercase `username`/`email` before persisting, mirroring the normalization done at registration (`auth.service.ts` lowercases username at signup).

**Why:** Login normalizes the identifier (`.trim().toLowerCase()`) before matching against the stored value. If an admin edit form saves a field with different casing or stray whitespace (e.g. `"Mahadev "` typed in the UI), the stored value can never match a normalized login lookup again — this causes a silent, permanent lockout that looks like a "password reset didn't work" bug but is actually an identifier-mismatch bug. Found 10 production accounts corrupted this way from past admin edits.

**How to apply:** Whenever adding or reviewing an admin/back-office write path that touches a field also used for authentication or lookup (username, email, phone-as-identifier, etc.), check it normalizes identically to the original creation/registration path. Don't assume Prisma unique constraints catch this — case/whitespace variants are different strings and won't collide.
