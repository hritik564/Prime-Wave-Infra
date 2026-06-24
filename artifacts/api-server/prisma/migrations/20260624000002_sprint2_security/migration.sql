-- AlterEnum: add BLOCKED value to UserStatus
ALTER TYPE "UserStatus" ADD VALUE 'BLOCKED';

-- CreateTable: admin_logs
CREATE TABLE "admin_logs" (
    "id"           TEXT NOT NULL,
    "adminId"      TEXT NOT NULL,
    "action"       TEXT NOT NULL,
    "targetUserId" TEXT,
    "details"      JSONB,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_logs_adminId_idx"      ON "admin_logs"("adminId");
CREATE INDEX "admin_logs_targetUserId_idx" ON "admin_logs"("targetUserId");

-- AddForeignKey: admin_logs → admins
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "admins"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: admin_logs → users (nullable, SET NULL on user delete)
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
