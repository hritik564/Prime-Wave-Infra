CREATE TYPE "CommonTemporaryPasswordResetOperationType" AS ENUM ('COMMON_TEMPORARY_PASSWORD', 'FULL_REPLACEMENT');

ALTER TABLE "common_temporary_password_reset_runs"
ADD COLUMN "operationType" "CommonTemporaryPasswordResetOperationType" NOT NULL DEFAULT 'COMMON_TEMPORARY_PASSWORD';