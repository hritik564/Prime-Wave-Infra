-- Additive only: no existing investment/user/ledger rows are rewritten.
ALTER TYPE "PlanType" ADD VALUE 'SINGLE';
ALTER TABLE "investments" ALTER COLUMN "durationDays" DROP NOT NULL;
ALTER TABLE "investments" ALTER COLUMN "maturesAt" DROP NOT NULL;
ALTER TABLE "roi_ledger" ADD COLUMN "cycleKey" TEXT;
CREATE UNIQUE INDEX "roi_ledger_investmentId_cycleKey_key" ON "roi_ledger"("investmentId", "cycleKey");

CREATE TABLE "single_plan_accounts" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "originalCapital" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "roiAccrued" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "roiClaimed" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "roiCompounded" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "claimableRoi" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "principalReturned" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "tier" INTEGER NOT NULL DEFAULT 3,
  "qualifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "single_plan_nonnegative" CHECK (
    "originalCapital" >= 0 AND "roiAccrued" >= 0 AND "roiClaimed" >= 0 AND
    "roiCompounded" >= 0 AND "claimableRoi" >= 0 AND "principalReturned" >= 0),
  CONSTRAINT "single_plan_tier" CHECK ("tier" IN (3,5)),
  CONSTRAINT "single_plan_entitlement" CHECK ("roiAccrued" <= "originalCapital" * ("tier" - 1)),
  CONSTRAINT "single_plan_roi_conservation" CHECK ("roiAccrued" = "roiClaimed" + "roiCompounded" + "claimableRoi"),
  CONSTRAINT "single_plan_principal" CHECK ("principalReturned" <= "originalCapital"),
  CONSTRAINT "single_plan_qualification" CHECK (("tier" = 3 AND "qualifiedAt" IS NULL) OR ("tier" = 5 AND "qualifiedAt" IS NOT NULL))
);
CREATE TABLE "single_plan_events" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "single_plan_accounts"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "investmentId" TEXT REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('CONTRIBUTION','ROI_ACCRUAL','ROI_CLAIM','QUALIFIED')),
  "amount" DECIMAL(18,8) NOT NULL CHECK ("amount" >= 0),
  "key" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "single_plan_events_key_key" ON "single_plan_events"("key");
CREATE INDEX "single_plan_events_userId_createdAt_idx" ON "single_plan_events"("userId", "createdAt");
CREATE TABLE "single_plan_cycles" (
  "userId" TEXT NOT NULL REFERENCES "single_plan_accounts"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "cycleKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId","cycleKey")
);
