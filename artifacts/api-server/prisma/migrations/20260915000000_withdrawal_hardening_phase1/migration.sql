-- Phase 1 withdrawal hardening.
-- Additive only. This migration is intentionally not applied to production by
-- the hardening task.

ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'BROADCAST_UNKNOWN';

ALTER TABLE "withdrawal_requests"
  ADD COLUMN IF NOT EXISTS "claimOwner" TEXT,
  ADD COLUMN IF NOT EXISTS "claimToken" TEXT,
  ADD COLUMN IF NOT EXISTS "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "broadcastUnknownAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "broadcastUnknownReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_requests_claimToken_key"
  ON "withdrawal_requests"("claimToken");
CREATE INDEX IF NOT EXISTS "withdrawal_requests_status_claimExpiresAt_idx"
  ON "withdrawal_requests"("status", "claimExpiresAt");
CREATE INDEX IF NOT EXISTS "withdrawal_requests_claimOwner_claimExpiresAt_idx"
  ON "withdrawal_requests"("claimOwner", "claimExpiresAt");

ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "withdrawal_request_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_withdrawal_request_id_key"
  ON "wallet_transactions"("withdrawal_request_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallet_transactions_withdrawal_request_id_fkey'
  ) THEN
    ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "wallet_transactions_withdrawal_request_id_fkey"
      FOREIGN KEY ("withdrawal_request_id")
      REFERENCES "withdrawal_requests"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;