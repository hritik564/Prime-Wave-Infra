-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "job_execution_logs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL,
    "recordsProcessed" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_execution_logs_jobName_idx" ON "job_execution_logs"("jobName");

-- CreateIndex
CREATE INDEX "job_execution_logs_status_idx" ON "job_execution_logs"("status");

-- CreateIndex
CREATE INDEX "job_execution_logs_createdAt_idx" ON "job_execution_logs"("createdAt");

-- CreateIndex
CREATE INDEX "deposit_requests_txHash_idx" ON "deposit_requests"("txHash");

-- RenameIndex
ALTER INDEX "system_settings_key_unique" RENAME TO "system_settings_key_key";
