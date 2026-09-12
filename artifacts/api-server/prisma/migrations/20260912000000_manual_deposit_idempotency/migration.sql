-- CreateTable
CREATE TABLE "manual_deposit_idempotency" (
    "id"                 TEXT NOT NULL,
    "adminId"            TEXT NOT NULL,
    "idempotencyKey"     TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "depositId"          TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "username"           TEXT NOT NULL,
    "amount"             DECIMAL(18,2) NOT NULL,
    "network"            "DepositNetwork" NOT NULL,
    "reason"             TEXT NOT NULL,
    "creditedAt"         TIMESTAMP(3) NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_deposit_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_deposit_idempotency_depositId_key"
    ON "manual_deposit_idempotency"("depositId");

-- CreateIndex
CREATE UNIQUE INDEX "manual_deposit_idempotency_adminId_idempotencyKey_key"
    ON "manual_deposit_idempotency"("adminId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "manual_deposit_idempotency_adminId_idx"
    ON "manual_deposit_idempotency"("adminId");

-- CreateIndex
CREATE INDEX "manual_deposit_idempotency_userId_idx"
    ON "manual_deposit_idempotency"("userId");