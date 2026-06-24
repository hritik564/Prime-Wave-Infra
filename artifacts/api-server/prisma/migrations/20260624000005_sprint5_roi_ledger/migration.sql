-- CreateTable
CREATE TABLE "roi_ledger" (
    "id"            TEXT          NOT NULL,
    "userId"        TEXT          NOT NULL,
    "investmentId"  TEXT          NOT NULL,
    "amount"        DECIMAL(18,8) NOT NULL,
    "cycleNumber"   INTEGER       NOT NULL,
    "wasCompounded" BOOLEAN       NOT NULL DEFAULT false,
    "wasClaimed"    BOOLEAN       NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roi_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roi_ledger_investmentId_idx" ON "roi_ledger"("investmentId");
CREATE INDEX "roi_ledger_userId_idx"       ON "roi_ledger"("userId");
CREATE INDEX "roi_ledger_wasCompounded_idx" ON "roi_ledger"("wasCompounded");
CREATE INDEX "roi_ledger_wasClaimed_idx"   ON "roi_ledger"("wasClaimed");

-- AddForeignKey: roi_ledger → users
ALTER TABLE "roi_ledger" ADD CONSTRAINT "roi_ledger_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: roi_ledger → investments
ALTER TABLE "roi_ledger" ADD CONSTRAINT "roi_ledger_investmentId_fkey"
    FOREIGN KEY ("investmentId") REFERENCES "investments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
