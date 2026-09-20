-- Stage 4: Super Admin-only bulk credential reset control plane.
-- This migration stores progress metadata only. Plaintext passwords are never
-- stored in PostgreSQL; credential artifacts are written to private storage.

CREATE TYPE "BulkPasswordResetRunStatus" AS ENUM (
  'PREPARING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "bulk_password_reset_runs" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "status" "BulkPasswordResetRunStatus" NOT NULL DEFAULT 'PREPARING',
  "totalEligible" INTEGER NOT NULL,
  "adminCount" INTEGER NOT NULL,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lastUserId" TEXT,
  "artifactObjectPath" TEXT NOT NULL,
  "artifactExpiresAt" TIMESTAMP(3) NOT NULL,
  "artifactDownloadedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bulk_password_reset_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bulk_password_reset_runs_status_idx"
  ON "bulk_password_reset_runs"("status");

CREATE INDEX "bulk_password_reset_runs_adminId_createdAt_idx"
  ON "bulk_password_reset_runs"("adminId", "createdAt");

ALTER TABLE "bulk_password_reset_runs"
  ADD CONSTRAINT "bulk_password_reset_runs_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "admins"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;