---
name: build:prod must include prisma generate
description: Production builds crash if prisma generate is not called after prisma migrate deploy when new schema columns are added.
---

## Rule
Always include `prisma generate` between `prisma migrate deploy` and `node ./build.mjs` in the `build:prod` script.

## Why
`prisma migrate deploy` only applies the SQL migration to the database. It does NOT regenerate the Prisma client. When `pnpm install` is cached (no package changes), the Prisma postinstall hook also does not re-run. If new columns are added in a migration, the bundled server binary will not know about them, and any query that references those columns will crash at runtime — before the health check can pass, causing the promote step to fail with a silent 11-second timeout.

## How to apply
The correct build:prod tail is always:
```
... && prisma migrate deploy && prisma generate && node ./build.mjs
```
Never omit `prisma generate` when a migration might add/rename/remove fields.
