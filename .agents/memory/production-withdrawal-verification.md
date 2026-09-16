---
name: Production withdrawal verification
description: Limits of read-only production verification for the automatic withdrawal system
---

Public health endpoints only prove that the web/API process responds. Production read-only SQL proves database state and schema, but not protected hot-wallet balances, latest/pending nonce, gas estimation, or private-key-to-wallet correspondence. Admin operational-health access is authenticated.

**Why:** A post-publish read-only audit must not obtain or expose credentials, call mutation endpoints, or use an existing withdrawal as a test. Logs may show worker validation and transient RPC retries without proving the full live signing envelope.

**How to apply:** Mark protected blockchain readiness items as NOT VERIFIED unless an authenticated, read-only operational path exposes the value safely. Do not approve a real withdrawal test solely from HTTP 200, migration state, environment flags, or worker activity.