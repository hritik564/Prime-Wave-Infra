ALTER TABLE "users"
ADD COLUMN "fullReplacementPasswordResetRunId" TEXT;

CREATE INDEX "users_fullReplacementPasswordResetRunId_idx"
ON "users"("fullReplacementPasswordResetRunId");

ALTER TABLE "users"
ADD CONSTRAINT "users_fullReplacementPasswordResetRunId_fkey"
FOREIGN KEY ("fullReplacementPasswordResetRunId")
REFERENCES "common_temporary_password_reset_runs"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;