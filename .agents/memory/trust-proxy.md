---
name: Trust proxy setting for Replit deployments
description: Replit's reverse proxy sets X-Forwarded-For; express-rate-limit requires trust proxy to be enabled.
---

## Rule

Always add `app.set("trust proxy", 1)` near the top of `app.ts`, before the rate limiter middleware is registered.

**Why:** Replit routes all traffic through a reverse proxy that injects `X-Forwarded-For`. Without this setting, `express-rate-limit` (v8+) detects the header and throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`, causing every request to fail.

## How to apply

In `app.ts`, add immediately after `const app = express()`:
```ts
app.set("trust proxy", 1);
```

This also makes `req.ip` correctly reflect the real client IP rather than the proxy address. Use value `1` (trust one hop) rather than `true` (trust all) for better security.
