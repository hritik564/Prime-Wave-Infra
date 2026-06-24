---
name: Prisma migration in Replit
description: How to run Prisma migrations in Replit's non-interactive shell environment
---

`prisma migrate dev` and `migrate dev --create-only` both fail with "non-interactive environment" error — even piping stdin doesn't help.

**Correct pattern for this project:**

1. Write migration SQL manually in `prisma/migrations/<timestamp>_<name>/migration.sql`
2. If the DB was bootstrapped with `db push` (no migration history), first baseline existing migrations:
   `pnpm exec prisma migrate resolve --applied <migration_folder_name>`
3. Apply new migrations: `pnpm exec prisma migrate deploy`
4. Regenerate client: `pnpm run db:generate`

**Why:** Replit shells are detected as non-interactive by Prisma Migrate, which blocks `migrate dev` entirely. `migrate deploy` is non-interactive and production-safe.

**How to apply:** Use this pattern for every schema change in Sprint 2+. Name migration folders `YYYYMMDDHHMMSS_description`. Keep Sprint 1 baseline (`20260624000000_sprint1_init`) already resolved.
