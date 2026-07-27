-- Migration: P1 — Separate BV pools for Binary Matching and Binary Orbit
--
-- Problem: matchingLeftBV/rightBV and orbitLeftBV/rightBV were the same shared
-- columns (leftBV + powerLeftBV / rightBV + powerRightBV). The matching engine
-- flushed ALL matched BV before orbit ran, leaving orbit with zero eligibility.
--
-- Solution: add four independent pool columns. Each engine reads and flushes
-- ONLY its own pair. propagateBV and addPowerBV write to ALL pools identically.
--
-- Existing columns (leftBV, rightBV, powerLeftBV, powerRightBV) are UNCHANGED —
-- they continue to accumulate as lifetime counters for the salary engine and
-- admin reports. A future migration may rename them for clarity.

ALTER TABLE "users" ADD COLUMN "matchingLeftBV"  DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "matchingRightBV" DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "orbitLeftBV"     DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "orbitRightBV"    DECIMAL(18,8) NOT NULL DEFAULT 0;

-- Seed both pools from the current effective BV
-- (organic + power, identical to what both engines computed before separation)
UPDATE "users" SET
  "matchingLeftBV"  = "leftBV" + "powerLeftBV",
  "matchingRightBV" = "rightBV" + "powerRightBV",
  "orbitLeftBV"     = "leftBV" + "powerLeftBV",
  "orbitRightBV"    = "rightBV" + "powerRightBV";
