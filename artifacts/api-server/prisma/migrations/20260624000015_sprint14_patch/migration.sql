-- Sprint 14 Patch: walletAddressSnapshot + adminNotes on withdrawal_requests
-- txHash @unique already applied in migration 20260624000014.

-- ── 1. Add walletAddressSnapshot (backfill from walletAddress, then NOT NULL) ─
ALTER TABLE "withdrawal_requests"
  ADD COLUMN "walletAddressSnapshot" TEXT;

UPDATE "withdrawal_requests"
  SET "walletAddressSnapshot" = "walletAddress";

ALTER TABLE "withdrawal_requests"
  ALTER COLUMN "walletAddressSnapshot" SET NOT NULL;

-- ── 2. Add adminNotes (nullable, internal admin use only) ─────────────────────
ALTER TABLE "withdrawal_requests"
  ADD COLUMN "adminNotes" TEXT;
