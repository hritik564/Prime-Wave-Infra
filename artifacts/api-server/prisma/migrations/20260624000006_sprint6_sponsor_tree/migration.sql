-- Add directReferralCount to users
ALTER TABLE "users" ADD COLUMN "directReferralCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: referral_history
CREATE TABLE "referral_history" (
    "id"        TEXT         NOT NULL,
    "sponsorId" TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_history_pkey" PRIMARY KEY ("id")
);

-- userId is unique — each user can only have one sponsor
CREATE UNIQUE INDEX "referral_history_userId_key" ON "referral_history"("userId");
CREATE INDEX "referral_history_sponsorId_idx"     ON "referral_history"("sponsorId");

-- AddForeignKey: referral_history → users (sponsor)
ALTER TABLE "referral_history" ADD CONSTRAINT "referral_history_sponsorId_fkey"
    FOREIGN KEY ("sponsorId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: referral_history → users (referred user)
ALTER TABLE "referral_history" ADD CONSTRAINT "referral_history_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
