-- Sprint 26E: Add VERIFICATION_DELAYED to DepositVerificationStatus enum
-- Non-terminal slow-poll state for verifications exceeding the delay threshold.

ALTER TYPE "DepositVerificationStatus" ADD VALUE IF NOT EXISTS 'VERIFICATION_DELAYED';

-- Seed system settings for delay configuration (idempotent)
INSERT INTO system_settings (id, key, value, description, "updatedAt")
VALUES
  (gen_random_uuid(), 'deposit_verification.delay_threshold_ms',       '1800000', 'Age (ms) at which VERIFYING transitions to VERIFICATION_DELAYED. Default: 30 min.',  NOW()),
  (gen_random_uuid(), 'deposit_verification.delayed_poll_interval_ms', '300000',  'Poll interval (ms) while in VERIFICATION_DELAYED slow-poll mode. Default: 5 min.',   NOW())
ON CONFLICT (key) DO NOTHING;
