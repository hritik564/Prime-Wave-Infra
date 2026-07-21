---
name: SP seeded accounts
description: 6,394 SP placeholder accounts in the binary tree; seeded deposit strategy; what can/cannot be deleted.
---

## Rule
Never delete SP accounts (username matches `^sp[0-9]{6}$`). 9 confirmed real users sit directly under SP accounts in the binary tree; deleting SPs would orphan them.

## What was seeded
- 6,394 accounts (sp000001–sp006394), all INACTIVE, placed deep in binary tree
- 128 of them (every 50th: sp000050, sp000100 … sp006350) had one $20,000 APPROVED DepositRequest each
- Total seeded business volume: $2,560,000
- Created by `networkFunder.mjs` in a single run on 2026-07-02 ~03:00–03:10 UTC

## What was NOT seeded
- No investments — `propagateBV()` was never triggered
- `user.leftBV / rightBV` on ancestors = 100% genuine organic
- Binary Matching and Orbit were never affected

## How it was removed (Sprint 33Z)
- Prisma migration `20260721130000_sprint33z_remove_seeded_business`
- DELETE from `deposit_requests` WHERE userId IN SP accounts AND status='APPROVED'
- UPDATE wallets SET depositWallet=0 WHERE userId IN SP accounts
- SP user records retained

**Why:** Binary Matching/Orbit read `leftBV+powerLeftBV`, not DepositRequest. Only Network Intelligence (team-business.service.ts) reads DepositRequest. Removing the 128 rows cleans Network Intelligence without touching BV or any other engine.

**How to apply:** If SP accounts appear in a future investigation, check investments count first — if 0, only DepositRequest rows need attention. If investments ever get added to SP accounts, BV propagation would need reversal too.
