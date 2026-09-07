---
name: Publish metadata-table drift
description: Replit Publish can treat Prisma engine metadata missing from a db-push development database as a destructive Production table deletion.
---

Replit Publish compares the live development and Production database catalogs, not the checked-in Prisma migration history. If development was synchronized with `prisma db push`, it may have all application tables but no `public._prisma_migrations`, while Production has the verified Prisma metadata table. Publish then proposes dropping `_prisma_migrations` and its migration rows.

**Why:** `_prisma_migrations` is engine metadata and is not represented in `schema.prisma`; adding it as an application model or dropping it from Production is unsafe. The deployment artifact can keep `prisma migrate deploy` in its production build, but project-side artifact/workflow settings do not suppress Publish's catalog diff.

**How to apply:** Before publishing, run the read-only schema-diff diagnostic. If the only destructive statement is `DROP TABLE "_prisma_migrations" CASCADE`, cancel the publish and do not run `build:prod` against development if that would recreate metadata. Use only a platform-supported no-schema-change deployment path; otherwise leave the app unpublished.