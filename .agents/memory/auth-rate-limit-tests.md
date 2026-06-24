---
name: Auth rate limiter in tests
description: authLimiter is 10 req/15-min window; test scripts that call login many times blow through it, causing 429 and null tokens.
---

# Auth rate limiter exhaustion in test scripts

**Rule:** The `authLimiter` middleware (`src/middleware/rateLimiter.middleware.ts`) allows **10 requests per 15-minute window** on auth routes (login, register, change-password).

**Why:** Test scripts frequently call `curl .../api/auth/login` for each assertion block, easily exceeding 10 in a single session.

**How to apply:**
- In test scripts: log in **once per user** at the top, store tokens in variables, and reuse them across all assertions in a single script.
- Never repeat login calls across multiple test blocks for the same user.
- If 429s appear during testing, **restart the workflow** — the rate limiter is in-memory and resets on restart.
- Batch all assertions for a sprint into a single shell script with one login per user.
