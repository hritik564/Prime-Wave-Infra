-- ── BinaryMatchIncome ─────────────────────────────────────────────────────────
CREATE TABLE "binary_match_income" (
    "id"           TEXT          NOT NULL,
    "userId"       TEXT          NOT NULL,
    "matchedBV"    DECIMAL(18,8) NOT NULL,
    "payableBV"    DECIMAL(18,8) NOT NULL,
    "destroyedBV"  DECIMAL(18,8) NOT NULL,
    "incomeAmount" DECIMAL(18,8) NOT NULL,
    "cycleStart"   TIMESTAMP(3)  NOT NULL,
    "cycleEnd"     TIMESTAMP(3)  NOT NULL,
    "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "binary_match_income_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "binary_match_income_userId_idx"     ON "binary_match_income"("userId");
CREATE INDEX "binary_match_income_cycleStart_idx" ON "binary_match_income"("cycleStart");
CREATE INDEX "binary_match_income_createdAt_idx"  ON "binary_match_income"("createdAt");

ALTER TABLE "binary_match_income"
    ADD CONSTRAINT "binary_match_income_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
