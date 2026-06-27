---
name: Admin controller auth access
description: How admin controllers read the authenticated admin identity — req.user, not res.locals.auth
---

## Rule
Admin controller handlers must access authenticated admin identity via `req.user`:

```typescript
const adminId    = req.user.sub;
const adminEmail = req.user.email;
```

Never use `res.locals.auth?.sub` or `res.locals.auth?.email` — those are never populated in this codebase.

**Why:** The `requireAdminAuth` middleware calls `requireAuth` which decodes the JWT and attaches it to `req.user` (typed as `AuthenticatedRequest`). There is no `res.locals.auth` pattern anywhere in the middleware chain.

**How to apply:** Any new admin controller handler that needs the caller's identity (for AdminLog, ownership checks, etc.) must cast `req` to `AuthenticatedRequest` and read from `req.user.sub` / `req.user.email`.
