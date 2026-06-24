-- ── BinaryOrbitIncome ─────────────────────────────────────────────────────────
CREATE TABLE "binary_orbit_income" (
    "id"                   TEXT          NOT NULL,
    "userId"               TEXT          NOT NULL,
    "matchedBV"            DECIMAL(18,8) NOT NULL,
    "rewardCount"          INTEGER       NOT NULL,
    "destroyedRewardCount" INTEGER       NOT NULL,
    "incomeAmount"         DECIMAL(18,8) NOT NULL,
    "cycleStart"           TIMESTAMP(3)  NOT NULL,
    "cycleEnd"             TIMESTAMP(3)  NOT NULL,
    "createdAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "binary_orbit_income_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "binary_orbit_income_userId_idx"     ON "binary_orbit_income"("userId");
CREATE INDEX "binary_orbit_income_cycleStart_idx" ON "binary_orbit_income"("cycleStart");
CREATE INDEX "binary_orbit_income_createdAt_idx"  ON "binary_orbit_income"("createdAt");

ALTER TABLE "binary_orbit_income"
    ADD CONSTRAINT "binary_orbit_income_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── SystemSettings ────────────────────────────────────────────────────────────
CREATE TABLE "system_settings" (
    "id"          TEXT         NOT NULL,
    "key"         TEXT         NOT NULL,
    "value"       TEXT         NOT NULL,
    "description" TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey"       PRIMARY KEY ("id"),
    CONSTRAINT "system_settings_key_unique" UNIQUE      ("key")
);

-- ── Seed default settings ─────────────────────────────────────────────────────
INSERT INTO "system_settings" ("id", "key", "value", "description", "updatedAt") VALUES
  (gen_random_uuid()::text, 'orbit.bv_per_reward',         '150', 'BV required per orbit reward unit',                    NOW()),
  (gen_random_uuid()::text, 'orbit.max_rewards_per_cycle', '1',   'Maximum orbit rewards paid per cycle',                 NOW()),
  (gen_random_uuid()::text, 'orbit.income_per_reward',     '500', 'USD payout per orbit reward',                          NOW()),
  (gen_random_uuid()::text, 'orbit.min_referrals',         '2',   'Minimum direct referrals required to qualify for orbit',NOW()),
  (gen_random_uuid()::text, 'matching.max_payable_bv',     '50',  'Maximum BV cap per matching cycle',                    NOW()),
  (gen_random_uuid()::text, 'matching.income_per_bv',      '5',   'USD payout per BV unit matched',                       NOW()),
  (gen_random_uuid()::text, 'matching.min_referrals',      '2',   'Minimum direct referrals required to qualify for matching', NOW());
