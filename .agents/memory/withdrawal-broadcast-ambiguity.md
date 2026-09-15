---
name: Withdrawal broadcast ambiguity
description: Safety rule for raw blockchain transaction submission and refunds
---

Raw transaction submission is not equivalent to a read-only RPC call. A timeout or network error after `eth_sendRawTransaction` may mean the node accepted the transaction, so the client must not automatically retry, fail over, or refund the user. Route the withdrawal to an explicit unknown-broadcast reconciliation state and only apply financial side effects after the chain outcome is known.

**Why:** Retrying a read-only query is usually safe, but retrying a broadcast or treating its error as proof of rejection can create duplicate processing, nonce conflicts, or a successful on-chain transfer plus an automatic refund.

**How to apply:** Keep retry/failover behavior for read-only RPC methods, disable it for raw broadcast submission, persist an ambiguous state, and make reconciliation and completion/refund transitions conditional and idempotent.