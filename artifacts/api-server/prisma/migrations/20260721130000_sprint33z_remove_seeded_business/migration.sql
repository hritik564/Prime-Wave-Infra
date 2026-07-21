-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260721130000_sprint33z_remove_seeded_business
--
-- PURPOSE
--   Removes all historical demo-seed business from production.
--   The networkFunder script created 6,394 SP placeholder accounts
--   (username pattern ^sp[0-9]{6}$) and approved 128 DepositRequest records
--   of $20,000 each ($2,560,000 total) solely to inflate Network Intelligence
--   team-business figures for the early network demonstration.
--
--   SP accounts had NO investments — BV propagation was never triggered.
--   leftBV/rightBV on all ancestors is already 100% genuine organic.
--   Only DepositRequest records and the depositWallet balances they inflated
--   need to be removed.
--
--   SP user accounts are RETAINED as binary tree structural placeholders.
--   9 real users are placed directly under SP accounts and cannot be orphaned.
--
-- CHANGES
--   §1  Delete 128 APPROVED DepositRequest rows from SP accounts
--   §2  Zero the depositWallet balance on all SP accounts' wallets
--
-- VERIFICATION (after migration)
--   SELECT COUNT(*), SUM(amount) FROM deposit_requests dr
--   JOIN users u ON u.id = dr."userId"
--   WHERE u.username ~ '^sp[0-9]{6}$' AND dr.status = 'APPROVED';
--   → should return 0 rows, $0
--
--   SELECT SUM("depositWallet") FROM wallets w
--   JOIN users u ON u.id = w."userId"
--   WHERE u.username ~ '^sp[0-9]{6}$';
--   → should return $0.00000000
-- ─────────────────────────────────────────────────────────────────────────────

-- §1 — Remove seeded approved deposits
DELETE FROM deposit_requests
WHERE "userId" IN (
  SELECT id FROM users WHERE username ~ '^sp[0-9]{6}$'
)
AND status = 'APPROVED';

-- §2 — Zero the inflated depositWallet balances on SP accounts
UPDATE wallets
SET "depositWallet" = 0.00000000
WHERE "userId" IN (
  SELECT id FROM users WHERE username ~ '^sp[0-9]{6}$'
);
