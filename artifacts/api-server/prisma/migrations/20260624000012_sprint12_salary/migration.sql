-- ── SalaryRankConfig ──────────────────────────────────────────────────────────
CREATE TABLE "salary_rank_config" (
    "id"                  TEXT           NOT NULL,
    "rankName"            TEXT           NOT NULL,
    "requiredBusiness"    DECIMAL(18,2)  NOT NULL,
    "monthlySalary"       DECIMAL(18,2)  NOT NULL,
    "durationMonths"      INTEGER        NOT NULL,
    "requiresDualDirects" BOOLEAN        NOT NULL DEFAULT false,
    "allowSpill"          BOOLEAN        NOT NULL DEFAULT false,
    "powerLegRequired"    DECIMAL(18,2),
    "weakLegRequired"     DECIMAL(18,2),
    "isActive"            BOOLEAN        NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_rank_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_rank_config_rankName_key" ON "salary_rank_config"("rankName");

-- ── SalaryAchievement ─────────────────────────────────────────────────────────
CREATE TABLE "salary_achievement" (
    "id"            TEXT          NOT NULL,
    "userId"        TEXT          NOT NULL,
    "rankName"      TEXT          NOT NULL,
    "achievedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"     TIMESTAMP(3)  NOT NULL,
    "monthlyAmount" DECIMAL(18,2) NOT NULL,
    "isActive"      BOOLEAN       NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_achievement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_achievement_userId_rankName_key" ON "salary_achievement"("userId", "rankName");
CREATE INDEX "salary_achievement_userId_idx"   ON "salary_achievement"("userId");
CREATE INDEX "salary_achievement_isActive_idx" ON "salary_achievement"("isActive");
CREATE INDEX "salary_achievement_expiresAt_idx" ON "salary_achievement"("expiresAt");

ALTER TABLE "salary_achievement"
    ADD CONSTRAINT "salary_achievement_userId_fkey"
        FOREIGN KEY ("userId")   REFERENCES "users"("id")              ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "salary_achievement_rankName_fkey"
        FOREIGN KEY ("rankName") REFERENCES "salary_rank_config"("rankName") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── SalaryIncome ──────────────────────────────────────────────────────────────
CREATE TABLE "salary_income" (
    "id"        TEXT          NOT NULL,
    "userId"    TEXT          NOT NULL,
    "rankName"  TEXT          NOT NULL,
    "month"     INTEGER       NOT NULL,
    "year"      INTEGER       NOT NULL,
    "amount"    DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_income_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_income_userId_rankName_month_year_key" ON "salary_income"("userId", "rankName", "month", "year");
CREATE INDEX "salary_income_userId_idx"    ON "salary_income"("userId");
CREATE INDEX "salary_income_year_month_idx" ON "salary_income"("year", "month");
CREATE INDEX "salary_income_createdAt_idx" ON "salary_income"("createdAt");

ALTER TABLE "salary_income"
    ADD CONSTRAINT "salary_income_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Seed rank data ────────────────────────────────────────────────────────────
INSERT INTO "salary_rank_config"
  ("id", "rankName", "requiredBusiness", "monthlySalary", "durationMonths",
   "requiresDualDirects", "allowSpill", "powerLegRequired", "weakLegRequired", "isActive")
VALUES
  (gen_random_uuid()::text, 'Bronze',         2000,    40,     6,  false, false, NULL,   NULL,   true),
  (gen_random_uuid()::text, 'Silver',         5000,    75,     6,  false, false, NULL,   NULL,   true),
  (gen_random_uuid()::text, 'Gold',           12500,   125,    6,  false, false, NULL,   NULL,   true),
  (gen_random_uuid()::text, 'Platinum',       25000,   250,    8,  true,  true,  10000,  15000,  true),
  (gen_random_uuid()::text, 'Sapphire',       60000,   500,    8,  true,  true,  24000,  36000,  true),
  (gen_random_uuid()::text, 'Ruby',           100000,  750,    10, true,  true,  40000,  60000,  true),
  (gen_random_uuid()::text, 'Emerald',        150000,  1250,   10, true,  true,  60000,  90000,  true),
  (gen_random_uuid()::text, 'Diamond',        300000,  2000,   12, true,  true,  120000, 180000, true),
  (gen_random_uuid()::text, 'Ambassador',     500000,  5000,   12, true,  true,  200000, 300000, true),
  (gen_random_uuid()::text, 'Sovereign Crown',1000000, 10000,  18, true,  true,  400000, 600000, true)
ON CONFLICT ("rankName") DO NOTHING;
