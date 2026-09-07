---
name: Publish development-data copy
description: Replit Publish can copy the development database state into Production before the app build.
---

Replit documents an optional Publish setting, “Set up your production database with your current development data,” that copies the development database’s current structure and rows into Production and can overwrite existing Production data. It is a Publish UI behavior, not controlled by artifact.toml or the application workflow. A build log can show the copy succeeding before the production build starts.

**Why:** A db-push development database may be empty and lack `_prisma_migrations`; copying it over an existing migrated database can remove migration metadata and leave a nonempty schema that makes `prisma migrate deploy` fail with P3005.

**How to apply:** For an existing authoritative Production database, keep the data-copy option off and never treat a republish as database-neutral unless the UI and build logs confirm no data-copy stage and no destructive schema diff. A final read-only snapshot cannot rule out a transient staged write or rollback.