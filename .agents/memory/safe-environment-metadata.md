---
name: Safe environment metadata
description: How to interpret Replit environment and secret metadata without exposing values.
---

Use `viewEnvVars` with `type: "all"` and inspect non-secret values under the requested environment (including shared values) and secret existence as boolean flags. Do not infer presence merely because a requested key appears in the response, and never print secret values.

**Why:** The metadata response can include requested secret names with false existence flags, while non-secret environment variables are grouped by environment rather than returned as a flat map.

**How to apply:** For production-readiness checks, report only safe value/status facts such as a non-secret dry-run setting and whether each secret exists; keep private keys, RPC URLs, and credentials out of logs and output.