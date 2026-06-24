-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM (
    'DEPOSIT',
    'INVESTMENT',
    'ROI_CLAIM',
    'PRINCIPAL_RELEASE',
    'INCOME_TRANSFER',
    'BINARY_MATCH',
    'BINARY_ORBIT',
    'LEVEL_INCOME',
    'SALARY',
    'WITHDRAWAL'
);

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id"          TEXT NOT NULL,
    "walletId"    TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "type"        "TransactionType"    NOT NULL,
    "status"      "TransactionStatus"  NOT NULL DEFAULT 'PENDING',
    "amount"      DECIMAL(18,8)        NOT NULL,
    "fee"         DECIMAL(18,8),
    "netAmount"   DECIMAL(18,8),
    "description" TEXT,
    "metadata"    JSONB,
    "createdAt"   TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)         NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_idx"  ON "wallet_transactions"("walletId");
CREATE INDEX "wallet_transactions_userId_idx"    ON "wallet_transactions"("userId");
CREATE INDEX "wallet_transactions_type_idx"      ON "wallet_transactions"("type");
CREATE INDEX "wallet_transactions_status_idx"    ON "wallet_transactions"("status");
CREATE INDEX "wallet_transactions_createdAt_idx" ON "wallet_transactions"("createdAt");

-- AddForeignKey: wallet_transactions → wallets
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "wallets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: wallet_transactions → users
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
