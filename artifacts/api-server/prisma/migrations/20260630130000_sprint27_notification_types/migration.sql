-- Sprint 27: Add deposit-lifecycle notification types
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEPOSIT_VERIFICATION_DELAYED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DEPOSIT_FAILED';
