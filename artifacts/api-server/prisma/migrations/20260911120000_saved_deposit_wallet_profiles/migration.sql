-- Extend the existing company wallet table rather than creating a competing
-- deposit-wallet configuration system. Existing rows retain their address and
-- active state. The legacy QR path points at the existing bundled production
-- QR asset until an administrator explicitly replaces it.
ALTER TABLE "company_wallets"
  ADD COLUMN "qrObjectPath" TEXT NOT NULL DEFAULT '/legacy/deposit-wallet-qr',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Only one active BEP20 company wallet may exist at a time. Other historical
-- network rows remain untouched.
CREATE UNIQUE INDEX "company_wallets_one_active_bep20_idx"
  ON "company_wallets" ("network")
  WHERE "network" = 'BEP20' AND "isActive" = true;

-- Enforce the five-profile limit at the database boundary as well as in the
-- service transaction. The advisory lock serializes concurrent inserts.
CREATE OR REPLACE FUNCTION "enforce_company_wallet_bep20_limit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_count INTEGER;
BEGIN
  IF NEW."network" = 'BEP20' THEN
    PERFORM pg_advisory_xact_lock(hashtext('primewave.company_wallets.bep20.limit'));
    SELECT COUNT(*) INTO profile_count
      FROM "company_wallets"
      WHERE "network" = 'BEP20';

    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD."network" <> 'BEP20') THEN
      profile_count := profile_count + 1;
    END IF;

    IF profile_count > 5 THEN
      RAISE EXCEPTION 'A maximum of 5 BEP20 company wallets is allowed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "company_wallets_bep20_limit_trigger"
  BEFORE INSERT OR UPDATE OF "network" ON "company_wallets"
  FOR EACH ROW
  EXECUTE FUNCTION "enforce_company_wallet_bep20_limit"();