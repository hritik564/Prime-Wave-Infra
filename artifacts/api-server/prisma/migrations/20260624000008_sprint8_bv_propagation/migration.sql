-- ── MatchBvLedger ────────────────────────────────────────────────────────────
CREATE TABLE "match_bv_ledger" (
    "id"           TEXT             NOT NULL,
    "userId"       TEXT             NOT NULL,
    "investorId"   TEXT             NOT NULL,
    "investmentId" TEXT             NOT NULL,
    "bv"           DECIMAL(18,8)    NOT NULL,
    "side"         "BinaryPosition" NOT NULL,
    "depth"        INTEGER          NOT NULL,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_bv_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "match_bv_ledger_userId_idx"       ON "match_bv_ledger"("userId");
CREATE INDEX "match_bv_ledger_investorId_idx"   ON "match_bv_ledger"("investorId");
CREATE INDEX "match_bv_ledger_investmentId_idx" ON "match_bv_ledger"("investmentId");
CREATE INDEX "match_bv_ledger_createdAt_idx"    ON "match_bv_ledger"("createdAt");

ALTER TABLE "match_bv_ledger"
    ADD CONSTRAINT "match_bv_ledger_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "match_bv_ledger_investorId_fkey"
        FOREIGN KEY ("investorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "match_bv_ledger_investmentId_fkey"
        FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── OrbitBvLedger ─────────────────────────────────────────────────────────────
CREATE TABLE "orbit_bv_ledger" (
    "id"           TEXT             NOT NULL,
    "userId"       TEXT             NOT NULL,
    "investorId"   TEXT             NOT NULL,
    "investmentId" TEXT             NOT NULL,
    "bv"           DECIMAL(18,8)    NOT NULL,
    "side"         "BinaryPosition" NOT NULL,
    "depth"        INTEGER          NOT NULL,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orbit_bv_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orbit_bv_ledger_userId_idx"       ON "orbit_bv_ledger"("userId");
CREATE INDEX "orbit_bv_ledger_investorId_idx"   ON "orbit_bv_ledger"("investorId");
CREATE INDEX "orbit_bv_ledger_investmentId_idx" ON "orbit_bv_ledger"("investmentId");
CREATE INDEX "orbit_bv_ledger_createdAt_idx"    ON "orbit_bv_ledger"("createdAt");

ALTER TABLE "orbit_bv_ledger"
    ADD CONSTRAINT "orbit_bv_ledger_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "orbit_bv_ledger_investorId_fkey"
        FOREIGN KEY ("investorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "orbit_bv_ledger_investmentId_fkey"
        FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── SalaryBvLedger ────────────────────────────────────────────────────────────
CREATE TABLE "salary_bv_ledger" (
    "id"           TEXT             NOT NULL,
    "userId"       TEXT             NOT NULL,
    "investorId"   TEXT             NOT NULL,
    "investmentId" TEXT             NOT NULL,
    "bv"           DECIMAL(18,8)    NOT NULL,
    "side"         "BinaryPosition" NOT NULL,
    "depth"        INTEGER          NOT NULL,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_bv_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salary_bv_ledger_userId_idx"       ON "salary_bv_ledger"("userId");
CREATE INDEX "salary_bv_ledger_investorId_idx"   ON "salary_bv_ledger"("investorId");
CREATE INDEX "salary_bv_ledger_investmentId_idx" ON "salary_bv_ledger"("investmentId");
CREATE INDEX "salary_bv_ledger_createdAt_idx"    ON "salary_bv_ledger"("createdAt");

ALTER TABLE "salary_bv_ledger"
    ADD CONSTRAINT "salary_bv_ledger_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "salary_bv_ledger_investorId_fkey"
        FOREIGN KEY ("investorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "salary_bv_ledger_investmentId_fkey"
        FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── BvHistory (unified audit trail) ──────────────────────────────────────────
CREATE TABLE "bv_history" (
    "id"           TEXT             NOT NULL,
    "userId"       TEXT             NOT NULL,
    "investorId"   TEXT             NOT NULL,
    "investmentId" TEXT             NOT NULL,
    "bv"           DECIMAL(18,8)    NOT NULL,
    "side"         "BinaryPosition" NOT NULL,
    "depth"        INTEGER          NOT NULL,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bv_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bv_history_userId_idx"       ON "bv_history"("userId");
CREATE INDEX "bv_history_investorId_idx"   ON "bv_history"("investorId");
CREATE INDEX "bv_history_investmentId_idx" ON "bv_history"("investmentId");
CREATE INDEX "bv_history_createdAt_idx"    ON "bv_history"("createdAt");

ALTER TABLE "bv_history"
    ADD CONSTRAINT "bv_history_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "bv_history_investorId_fkey"
        FOREIGN KEY ("investorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "bv_history_investmentId_fkey"
        FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
