-- ── LevelIncome ───────────────────────────────────────────────────────────────
CREATE TABLE "level_income" (
    "id"               TEXT          NOT NULL,
    "receiverUserId"   TEXT          NOT NULL,
    "sourceUserId"     TEXT          NOT NULL,
    "level"            INTEGER       NOT NULL,
    "investmentId"     TEXT          NOT NULL,
    "investmentAmount" DECIMAL(18,8) NOT NULL,
    "percentage"       DECIMAL(6,4)  NOT NULL,
    "incomeAmount"     DECIMAL(18,8) NOT NULL,
    "createdAt"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_income_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "level_income_receiverUserId_idx" ON "level_income"("receiverUserId");
CREATE INDEX "level_income_sourceUserId_idx"   ON "level_income"("sourceUserId");
CREATE INDEX "level_income_investmentId_idx"   ON "level_income"("investmentId");
CREATE INDEX "level_income_level_idx"          ON "level_income"("level");
CREATE INDEX "level_income_createdAt_idx"      ON "level_income"("createdAt");

ALTER TABLE "level_income"
    ADD CONSTRAINT "level_income_receiverUserId_fkey"
        FOREIGN KEY ("receiverUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "level_income_sourceUserId_fkey"
        FOREIGN KEY ("sourceUserId")   REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "level_income_investmentId_fkey"
        FOREIGN KEY ("investmentId")   REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
