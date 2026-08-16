---
name: Reprocess sets PENDING not QUEUED
description: reprocessWithdrawal must reset to PENDING so the 30-second poller picks it up; setting QUEUED directly leaves it stuck forever.
---

# Admin Reprocess → PENDING, not QUEUED

## The rule
`reprocessWithdrawal()` sets status to `PENDING` (not `QUEUED`) and backdates `requestedAt` by 1 hour to bypass the hold-period filter.

## Why
`processPendingWithdrawals()` in `withdrawal-processor.service.ts` only queries `WHERE status = 'PENDING'`. The QUEUED state is an internal step the processor advances to itself after VALIDATING. Jumping directly to QUEUED means no poller ever picks it up — the withdrawal sits stuck at QUEUED forever.

## How to apply
Any admin action that wants to "restart" a withdrawal must set it to PENDING and backdate requestedAt, never to QUEUED. The full automated pipeline handles the rest:
PENDING → VALIDATING → QUEUED → PROCESSING → SIGNING → BROADCASTING → CONFIRMING → COMPLETED
