-- AlterTable: add new optional columns to users
ALTER TABLE "users"
    ADD COLUMN "walletAddress"  TEXT,
    ADD COLUMN "telegramId"     TEXT,
    ADD COLUMN "profileImage"   TEXT,
    ADD COLUMN "sponsorId"      TEXT,
    ADD COLUMN "binaryParentId" TEXT;

-- AddForeignKey: sponsor self-relation (UserSponsorRelation)
ALTER TABLE "users" ADD CONSTRAINT "users_sponsorId_fkey"
    FOREIGN KEY ("sponsorId") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: binary parent self-relation (UserBinaryRelation)
ALTER TABLE "users" ADD CONSTRAINT "users_binaryParentId_fkey"
    FOREIGN KEY ("binaryParentId") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
