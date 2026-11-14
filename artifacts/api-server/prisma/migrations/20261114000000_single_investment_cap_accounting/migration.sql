ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'SINGLE';

CREATE TYPE "InvestmentCapTier" AS ENUM ('NON_WORKING', 'WORKING');
CREATE TYPE "InvestmentAccountingEventType" AS ENUM (
  'CONTRIBUTION',
  'ROI_ACCRUAL',
  'ROI_CLAIM',
  'ROI_COMPOUND',
  'PRINCIPAL_RETURN',
  'TIER_UPGRADE'
);

ALTER TABLE "investments"
  ALTER COLUMN "durationDays" DROP NOT NULL,
  ALTER COLUMN "maturesAt" DROP NOT NULL;

ALTER TABLE "roi_ledger" ADD COLUMN "cycleKey" TEXT;
CREATE UNIQUE INDEX "roi_ledger_investmentId_cycleKey_key"
  ON "roi_ledger"("investmentId", "cycleKey");

CREATE TABLE "investment_cap_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "originalCapital" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "cumulativeRoiAccrued" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "cumulativeRoiClaimed" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "cumulativeRoiCompounded" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "claimableRoi" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "originalPrincipalReturned" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "principalOwed" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "capTier" "InvestmentCapTier" NOT NULL DEFAULT 'NON_WORKING',
  "qualifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "investment_cap_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "investment_cap_accounts_userId_key"
  ON "investment_cap_accounts"("userId");
ALTER TABLE "investment_cap_accounts"
  ADD CONSTRAINT "investment_cap_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "investment_accounting_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "investmentId" TEXT,
  "eventType" "InvestmentAccountingEventType" NOT NULL,
  "amount" DECIMAL(18,8) NOT NULL,
  "referenceKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "investment_accounting_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "investment_accounting_events_referenceKey_key"
  ON "investment_accounting_events"("referenceKey");
CREATE INDEX "investment_accounting_events_userId_createdAt_idx"
  ON "investment_accounting_events"("userId", "createdAt");
CREATE INDEX "investment_accounting_events_investmentId_idx"
  ON "investment_accounting_events"("investmentId");
CREATE INDEX "investment_accounting_events_eventType_idx"
  ON "investment_accounting_events"("eventType");
ALTER TABLE "investment_accounting_events"
  ADD CONSTRAINT "investment_accounting_events_account_fkey"
  FOREIGN KEY ("userId") REFERENCES "investment_cap_accounts"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "investment_accounting_events"
  ADD CONSTRAINT "investment_accounting_events_investmentId_fkey"
  FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
