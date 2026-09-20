---
name: Password reset delivery boundary
description: Security boundary for the staged normal-user credential reset flow
---

The password-reset system must keep raw tokens transient and fail closed when no trusted email/SMS delivery adapter is configured. The API may return only a generic response and may log delivery availability without the token or password.

**Why:** A delivery fallback that returns or logs the raw token would turn a credential-reset endpoint into a credential disclosure path. The ownership-transition reset must not begin until users have a trusted way to receive one-time links.

**How to apply:** Before any controlled or mass reset, connect and test a production-approved provider through the delivery boundary, including failure handling, generic responses, and one-time token consumption.