-- Restore impersonation_sessions table
-- Uses IF NOT EXISTS guards so this is safe to run on any environment
-- regardless of whether the table was previously created or dropped.

CREATE TABLE IF NOT EXISTS "impersonation_sessions" (
    "id"           TEXT         NOT NULL,
    "adminId"      TEXT         NOT NULL,
    "targetUserId" TEXT         NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"      TIMESTAMP(3),
    "ip"           TEXT         NOT NULL,
    "userAgent"    TEXT         NOT NULL,
    "reason"       TEXT,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "impersonation_sessions_adminId_idx"       ON "impersonation_sessions"("adminId");
CREATE INDEX IF NOT EXISTS "impersonation_sessions_targetUserId_idx"  ON "impersonation_sessions"("targetUserId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'impersonation_sessions_adminId_fkey'
  ) THEN
    ALTER TABLE "impersonation_sessions"
      ADD CONSTRAINT "impersonation_sessions_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'impersonation_sessions_targetUserId_fkey'
  ) THEN
    ALTER TABLE "impersonation_sessions"
      ADD CONSTRAINT "impersonation_sessions_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
