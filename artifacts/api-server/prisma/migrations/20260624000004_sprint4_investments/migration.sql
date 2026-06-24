-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('PLAN_90', 'PLAN_180', 'PLAN_270', 'PLAN_360');

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('ACTIVE', 'MATURED', 'COMPLETED');

-- CreateTable
CREATE TABLE "investments" (
    "id"                 TEXT                NOT NULL,
    "userId"             TEXT                NOT NULL,
    "amount"             DECIMAL(18,8)       NOT NULL,
    "currentPrincipal"   DECIMAL(18,8)       NOT NULL,
    "planType"           "PlanType"          NOT NULL,
    "dailyROI"           DECIMAL(6,4)        NOT NULL,
    "durationDays"       INTEGER             NOT NULL,
    "autoCompound"       BOOLEAN             NOT NULL DEFAULT false,
    "claimableROI"       DECIMAL(18,8)       NOT NULL DEFAULT 0,
    "claimablePrincipal" DECIMAL(18,8)       NOT NULL DEFAULT 0,
    "status"             "InvestmentStatus"  NOT NULL DEFAULT 'ACTIVE',
    "startedAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturesAt"          TIMESTAMP(3)        NOT NULL,
    "completedAt"        TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investments_userId_idx"    ON "investments"("userId");
CREATE INDEX "investments_status_idx"    ON "investments"("status");
CREATE INDEX "investments_planType_idx"  ON "investments"("planType");
CREATE INDEX "investments_maturesAt_idx" ON "investments"("maturesAt");

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
