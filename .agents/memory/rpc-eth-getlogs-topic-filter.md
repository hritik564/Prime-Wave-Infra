---
name: BSC RPC log filter behavior
description: Provider-specific eth_getLogs behavior relevant to BEP20 transfer validation
---

The configured BSC RPC rejects `eth_getLogs` filters that include `topics` with JSON-RPC `-32602`, but accepts address-only bounded queries. Receipt log retrieval works and remains the authoritative withdrawal verification path.

**Why:** A read-only audit initially looked like a Transfer-topic or range failure; isolating filter parameters showed the provider limitation, while the withdrawal gateway also required the canonical ERC-20 Transfer topic.

**How to apply:** Do not weaken receipt verification or depend on topic-filtered log queries for settlement. If historical log discovery is needed, use bounded address-only queries and filter canonical topics locally, then verify the transaction receipt before any financial state change.