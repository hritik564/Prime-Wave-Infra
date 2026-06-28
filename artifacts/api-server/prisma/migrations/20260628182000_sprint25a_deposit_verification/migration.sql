-- Sprint 25A: Deposit Verification Engine
-- Adds DepositVerificationStatus enum, deposit_verifications table,
-- and seeds the configurable poll interval into system_settings.

-- ── 1. New enum ───────────────────────────────────────────────────────────────

CREATE TYPE "DepositVerificationStatus" AS ENUM (
  'CREATED',
  'TX_SUBMITTED',
  'VERIFYING',
  'WAITING_CONFIRMATIONS',
  'CONFIRMED',
  'CREDITED',
  'COMPLETED',
  'FAILED',
  'REJECTED',
  'EXPIRED'
);

-- ── 2. deposit_verifications table ────────────────────────────────────────────

CREATE TABLE "deposit_verifications" (
  "id"                    TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "depositId"             TEXT,
  "txHash"                TEXT NOT NULL,
  "network"               "DepositNetwork" NOT NULL,
  "senderAddress"         TEXT,
  "recipientAddress"      TEXT NOT NULL,
  "tokenContract"         TEXT,
  "blockchainAmount"      DECIMAL(18,8),
  "confirmations"         INTEGER NOT NULL DEFAULT 0,
  "requiredConfirmations" INTEGER NOT NULL DEFAULT 12,
  "verificationStatus"    "DepositVerificationStatus" NOT NULL DEFAULT 'CREATED',
  "verificationAttempts"  INTEGER NOT NULL DEFAULT 0,
  "lastCheckedAt"         TIMESTAMP(3),
  "nextCheckAt"           TIMESTAMP(3),
  "firstSeenAt"           TIMESTAMP(3),
  "confirmedAt"           TIMESTAMP(3),
  "creditedAt"            TIMESTAMP(3),
  "completedAt"           TIMESTAMP(3),
  "failureReason"         TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "deposit_verifications_pkey" PRIMARY KEY ("id")
);

-- ── 3. Unique constraints ─────────────────────────────────────────────────────

ALTER TABLE "deposit_verifications"
  ADD CONSTRAINT "deposit_verifications_depositId_key" UNIQUE ("depositId");

ALTER TABLE "deposit_verifications"
  ADD CONSTRAINT "deposit_verifications_txHash_key" UNIQUE ("txHash");

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX "deposit_verifications_verificationStatus_idx"
  ON "deposit_verifications"("verificationStatus");

CREATE INDEX "deposit_verifications_userId_idx"
  ON "deposit_verifications"("userId");

CREATE INDEX "deposit_verifications_txHash_idx"
  ON "deposit_verifications"("txHash");

CREATE INDEX "deposit_verifications_nextCheckAt_idx"
  ON "deposit_verifications"("nextCheckAt");

CREATE INDEX "deposit_verifications_createdAt_idx"
  ON "deposit_verifications"("createdAt");

-- ── 5. Foreign keys ───────────────────────────────────────────────────────────

ALTER TABLE "deposit_verifications"
  ADD CONSTRAINT "deposit_verifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deposit_verifications"
  ADD CONSTRAINT "deposit_verifications_depositId_fkey"
  FOREIGN KEY ("depositId") REFERENCES "deposit_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 6. System setting: configurable poll interval ─────────────────────────────
-- Workers read this key at startup. Change the value in DB to tune polling
-- without a code deployment.
--   Development recommendation : 5 000 ms
--   Production  recommendation : 20 000 ms (default)

INSERT INTO "system_settings" ("id", "key", "value", "description", "updatedAt")
VALUES (
  'cm_dvpoll00000000000000000',
  'deposit_verification.poll_interval_ms',
  '20000',
  'How often the deposit verification worker polls for pending verifications (ms). Dev: 5000, Prod: 20000.',
  NOW()
) ON CONFLICT ("key") DO NOTHING;
