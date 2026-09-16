---
name: Withdrawal broadcast ambiguity
description: Safety rule for raw blockchain transaction submission and refunds
---

Raw transaction submission is not equivalent to a read-only RPC call. A timeout or network error after `eth_sendRawTransaction` may mean the node accepted the transaction, so the client must not automatically retry, fail over, or refund the user. Route the withdrawal to an explicit unknown-broadcast reconciliation state and only apply financial side effects after the chain outcome is known.

**Why:** Retrying a read-only query is usually safe, but retrying a broadcast or treating its error as proof of rejection can create duplicate processing, nonce conflicts, or a successful on-chain transfer plus an automatic refund.

**How to apply:** Keep retry/failover behavior for read-only RPC methods, disable it for raw broadcast submission, persist an ambiguous state, and make reconciliation and completion/refund transitions conditional and idempotent. A row already in `MANUAL_REVIEW` must be excluded from the manual-review update so repeated reconciliation is a no-op.

Lifecycle markers must be evidence-gated: persist `SIGNED` only after cryptographic signing succeeds, persist `BROADCASTING` immediately before submission, and persist transaction hash/broadcast time only after the node returns a valid hash. If historical fields contradict that evidence, use an incident-specific, auditable correction to reach `MANUAL_REVIEW`; never silently reset an ambiguous withdrawal to an automatic retry state.

**Why:** A historical false-positive `signedAt` or lifecycle event can otherwise either block safe reconciliation forever or be mistaken for proof that a broadcast occurred. The correction must preserve the no-refund/no-retry boundary while making the record reviewable.

**How to apply:** Treat persisted transaction hash, broadcast timestamp, and evidence-backed lifecycle events as the chain-outcome boundary. Require exact incident identity, explicit evidence confirmation, no active claim, and idempotent status guards for any historical correction.