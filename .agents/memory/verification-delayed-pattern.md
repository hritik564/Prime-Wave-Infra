---
name: VERIFICATION_DELAYED slow-poll pattern
description: Sprint 26E pattern for replacing hard EXPIRED timeout with resilient slow-poll state.
---

When VERIFYING exceeds `delayThresholdMs` (30 min default), transition to VERIFICATION_DELAYED instead of EXPIRED.

**Key rules:**

1. VERIFICATION_DELAYED is in ACTIVE_VS — worker continues processing it.
2. `isTerminal()` does NOT include VERIFICATION_DELAYED.
3. On adapter error or TX-not-found, use `keepStatus` to preserve current status (VERIFYING or VERIFICATION_DELAYED), not always reset to VERIFYING.
4. Use `activePollMs(status, pollMs, delayedPollMs)` helper for nextCheckAt — delayed records use the slow interval (5 min default).
5. Once TX is found from VERIFICATION_DELAYED, proceed normally through WAITING_CONFIRMATIONS → CONFIRMED → CREDITED → COMPLETED with normal pollMs.
6. Audit log (AdminLog) written on VERIFYING → VERIFICATION_DELAYED transition (best-effort, non-fatal if admin fetch fails).
7. System settings keys: `deposit_verification.delay_threshold_ms`, `deposit_verification.delayed_poll_interval_ms`.

**Why:** Hard EXPIRED on timeout loses legitimate deposits during BSC congestion. Slow-poll keeps them alive indefinitely until on-chain confirmation or admin intervention.

**How to apply:** Same pattern for any future slow-polling state — always include in ACTIVE_VS, exclude from isTerminal, use keepStatus on retry paths, and use a separate poll interval constant.
