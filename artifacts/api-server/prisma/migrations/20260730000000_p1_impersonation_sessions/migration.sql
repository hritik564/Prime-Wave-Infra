-- CreateTable
CREATE TABLE "impersonation_sessions" (
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

-- CreateIndex
CREATE INDEX "impersonation_sessions_adminId_idx" ON "impersonation_sessions"("adminId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_targetUserId_idx" ON "impersonation_sessions"("targetUserId");

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
