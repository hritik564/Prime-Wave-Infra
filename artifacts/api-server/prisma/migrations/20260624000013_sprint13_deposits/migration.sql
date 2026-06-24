-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE "DepositNetwork" AS ENUM ('BEP20', 'ERC20', 'TRC20', 'SOL');
CREATE TYPE "DepositStatus"  AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ── CompanyWallet ──────────────────────────────────────────────────────────────
CREATE TABLE "company_wallets" (
    "id"            TEXT         NOT NULL,
    "network"       "DepositNetwork" NOT NULL,
    "walletAddress" TEXT         NOT NULL,
    "isActive"      BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_wallets_network_walletAddress_key" ON "company_wallets"("network", "walletAddress");
CREATE INDEX "company_wallets_network_idx"  ON "company_wallets"("network");
CREATE INDEX "company_wallets_isActive_idx" ON "company_wallets"("isActive");

-- ── DepositRequest ─────────────────────────────────────────────────────────────
CREATE TABLE "deposit_requests" (
    "id"                TEXT            NOT NULL,
    "userId"            TEXT            NOT NULL,
    "amount"            DECIMAL(18,2)   NOT NULL,
    "network"           "DepositNetwork" NOT NULL,
    "txHash"            TEXT            NOT NULL,
    "screenshotUrl"     TEXT,
    "companyWallet"     TEXT            NOT NULL,
    "status"            "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByAdminId" TEXT,
    "approvedAt"        TIMESTAMP(3),
    "rejectedReason"    TEXT,
    "createdAt"         TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deposit_requests_txHash_key" ON "deposit_requests"("txHash");
CREATE INDEX "deposit_requests_userId_idx"    ON "deposit_requests"("userId");
CREATE INDEX "deposit_requests_status_idx"    ON "deposit_requests"("status");
CREATE INDEX "deposit_requests_network_idx"   ON "deposit_requests"("network");
CREATE INDEX "deposit_requests_createdAt_idx" ON "deposit_requests"("createdAt");

ALTER TABLE "deposit_requests"
    ADD CONSTRAINT "deposit_requests_userId_fkey"
        FOREIGN KEY ("userId")            REFERENCES "users"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "deposit_requests_approvedByAdminId_fkey"
        FOREIGN KEY ("approvedByAdminId") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
