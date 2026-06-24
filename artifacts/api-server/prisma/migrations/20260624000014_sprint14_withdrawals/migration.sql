-- Sprint 14: Manual Withdrawal System
-- Adds WithdrawalNetwork/Status enums, WithdrawalSettings, WithdrawalRequest,
-- and lockedWithdrawalBalance column on wallets.

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE "WithdrawalNetwork" AS ENUM ('BEP20');
CREATE TYPE "WithdrawalStatus"  AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- ── wallets: add lockedWithdrawalBalance ──────────────────────────────────────
ALTER TABLE "wallets"
  ADD COLUMN "lockedWithdrawalBalance" DECIMAL(18, 8) NOT NULL DEFAULT 0;

-- ── withdrawal_settings ───────────────────────────────────────────────────────
CREATE TABLE "withdrawal_settings" (
  "id"            TEXT                 NOT NULL,
  "network"       "WithdrawalNetwork"  NOT NULL,
  "minimumAmount" DECIMAL(18, 8)       NOT NULL,
  "maximumAmount" DECIMAL(18, 8)       NOT NULL,
  "isEnabled"     BOOLEAN              NOT NULL DEFAULT true,
  "updatedAt"     TIMESTAMP(3)         NOT NULL,

  CONSTRAINT "withdrawal_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withdrawal_settings_network_key" ON "withdrawal_settings"("network");

-- ── withdrawal_requests ───────────────────────────────────────────────────────
CREATE TABLE "withdrawal_requests" (
  "id"                 TEXT                NOT NULL,
  "userId"             TEXT                NOT NULL,
  "amount"             DECIMAL(18, 8)      NOT NULL,
  "walletAddress"      TEXT                NOT NULL,
  "network"            "WithdrawalNetwork" NOT NULL,
  "status"             "WithdrawalStatus"  NOT NULL DEFAULT 'PENDING',
  "approvedByAdminId"  TEXT,
  "completedByAdminId" TEXT,
  "txHash"             TEXT,
  "rejectedReason"     TEXT,
  "cancelledAt"        TIMESTAMP(3),
  "approvedAt"         TIMESTAMP(3),
  "completedAt"        TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)        NOT NULL,

  CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withdrawal_requests_txHash_key" ON "withdrawal_requests"("txHash");
CREATE INDEX "withdrawal_requests_userId_idx"    ON "withdrawal_requests"("userId");
CREATE INDEX "withdrawal_requests_status_idx"    ON "withdrawal_requests"("status");
CREATE INDEX "withdrawal_requests_network_idx"   ON "withdrawal_requests"("network");
CREATE INDEX "withdrawal_requests_createdAt_idx" ON "withdrawal_requests"("createdAt");

ALTER TABLE "withdrawal_requests"
  ADD CONSTRAINT "withdrawal_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "withdrawal_requests"
  ADD CONSTRAINT "withdrawal_requests_approvedByAdminId_fkey"
    FOREIGN KEY ("approvedByAdminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "withdrawal_requests"
  ADD CONSTRAINT "withdrawal_requests_completedByAdminId_fkey"
    FOREIGN KEY ("completedByAdminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Seed default settings (BEP20: min=$10, max=$2500) ────────────────────────
INSERT INTO "withdrawal_settings" ("id", "network", "minimumAmount", "maximumAmount", "isEnabled", "updatedAt")
VALUES (gen_random_uuid()::text, 'BEP20', 10, 2500, true, NOW());
