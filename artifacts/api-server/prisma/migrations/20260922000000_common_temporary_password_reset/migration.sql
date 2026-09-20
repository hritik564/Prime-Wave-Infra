-- Stage 5N: Super Admin-only common temporary-password control plane.
-- The plaintext password is process-local and is never stored in PostgreSQL.

CREATE TYPE "CommonTemporaryPasswordResetRunStatus" AS ENUM (
  'PREPARING',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "common_temporary_password_reset_runs" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "status" "CommonTemporaryPasswordResetRunStatus" NOT NULL DEFAULT 'PREPARING',
  "totalEligible" INTEGER NOT NULL,
  "adminCount" INTEGER NOT NULL,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lastUserId" TEXT,
  "failureReason" TEXT,
  "workerLeaseUntil" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "activeLockKey" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "common_temporary_password_reset_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "common_temporary_password_reset_runs_activeLockKey_key"
  ON "common_temporary_password_reset_runs"("activeLockKey");

CREATE INDEX "common_temporary_password_reset_runs_status_idx"
  ON "common_temporary_password_reset_runs"("status");

CREATE INDEX "common_temporary_password_reset_runs_adminId_createdAt_idx"
  ON "common_temporary_password_reset_runs"("adminId", "createdAt");

ALTER TABLE "common_temporary_password_reset_runs"
  ADD CONSTRAINT "common_temporary_password_reset_runs_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admins"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;