-- CreateEnum: BinaryPosition
CREATE TYPE "BinaryPosition" AS ENUM ('LEFT', 'RIGHT');

-- AlterTable: add binary placement fields to users
ALTER TABLE "users"
  ADD COLUMN "position"              "BinaryPosition",
  ADD COLUMN "leftDeepestNodeId"     TEXT,
  ADD COLUMN "rightDeepestNodeId"    TEXT,
  ADD COLUMN "leftBV"                DECIMAL(18,8) NOT NULL DEFAULT 0,
  ADD COLUMN "rightBV"               DECIMAL(18,8) NOT NULL DEFAULT 0;
