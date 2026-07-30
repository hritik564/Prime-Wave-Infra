---
name: Impersonation session pattern
description: How the admin impersonation feature works end-to-end — JWT shape, backend service location, frontend storage strategy, and exit flow.
---

## Backend

- `startImpersonation` and `endImpersonation` live in `src/auth/auth.service.ts`
- Route: `POST /api/admin/users/:id/impersonate` → `impersonateUserHandler` in `admin-users.controller.ts`
- Exit route: `POST /api/auth/impersonation/exit` → `exitImpersonation` in `auth.controller.ts`
- DB model: `ImpersonationSession` (adminId, targetUserId, startedAt, endedAt, ip, userAgent, reason) mapped to `impersonation_sessions`
- Two `AdminLog` entries: `ADMIN_IMPERSONATION_STARTED` / `ADMIN_IMPERSONATION_ENDED`

## JWT shape

```ts
{ sub: targetUserId, email: targetEmail, type: 'user', impersonated: true, originalAdminId, sessionId }
```
- Expiry: hardcoded **2 hours** (not JWT_EXPIRES_IN)
- `type: 'user'` means all user-facing auth checks pass unmodified
- `sub` is the target user's ID, so profile/wallet queries return the target's data

## AuthPayload extension

```ts
impersonated?: true;
originalAdminId?: string;
sessionId?: string;
```

## Frontend storage during impersonation

| Key | Value |
|-----|-------|
| `pw:token` | Impersonation JWT |
| `pw:admin:token` | Admin JWT (NEVER touched during impersonation) |
| `pw:user` | Target user (StoredUser, type:'user') |
| `pw:imp:prev:user` | Original admin user (saved before overwrite) |

## Exit flow

1. Sync: restore admin user → `pw:user`, clear `pw:token` + `pw:imp:prev:user`, update React state to `pw:admin:token`
2. Async best-effort: fire-and-forget `POST /api/auth/impersonation/exit` with the now-stale imp token
3. Navigate to `/admin/members`

**Why sync-first**: if the imp token expires, the API call would fire 401 → `fireUnauthorized()` → `authLogout()` which would wipe the restored admin session. By restoring admin state before the fetch, even a 401 is harmless.

## Security guards

- Only SUPER_ADMIN may start impersonation (role checked server-side)
- Cannot impersonate while already impersonating (`user.impersonated` check in controller)
- Cannot impersonate a non-existent user (404 guard)
- Banner (`ImpersonationBanner.tsx`) shown on every user-facing page via `AppLayout.tsx`
