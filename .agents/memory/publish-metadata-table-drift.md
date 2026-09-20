---
name: Publish metadata-table drift
description: Replit Publish can treat Prisma engine metadata missing from a db-push development database as a destructive Production table deletion.
---

Replit Publish compares the live development and Production database catalogs, not the checked-in Prisma migration history. If development was synchronized with `prisma db push`, it may have application tables whose migration rows are missing or inconsistent, while Production has different verified Prisma metadata. A clean schema diff therefore does not prove that `prisma migrate deploy` is safe.

**Why:** `_prisma_migrations` is engine metadata and is not represented in `schema.prisma`; adding it as an application model or dropping it from Production is unsafe. The deployment artifact can keep `prisma migrate deploy` in its production build, but project-side artifact/workflow settings do not suppress Publish's catalog diff.

**How to apply:** Before publishing, run both the read-only schema-diff diagnostic and `prisma migrate status` against development, then compare `_prisma_migrations` with the live tables/enums in both environments. If the only destructive statement is `DROP TABLE "_prisma_migrations" CASCADE`, or if migration status says a migration is pending even though its objects already exist, cancel the publish and do not run `build:prod` until the history is reconciled. Use only a platform-supported no-schema-change deployment path; otherwise leave the app unpublished.