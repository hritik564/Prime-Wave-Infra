import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { logger } from "../../lib/logger.js";

const MASTER_USERNAME = "master";
const MASTER_EMAIL = "master@primewave.io";
const MASTER_REFERRAL_CODE = "MASTERROOT";
const MASTER_USER_ID = "pwmaster0000000000000001";
const MASTER_WALLET_ID = "pwmasterwal0000000000001";
const MASTER_PASSWORD = "Master@PrimeWave2025!";

/**
 * Pre-launch database reset.
 *
 * Triggered by: RESET_FOR_LAUNCH=true environment variable.
 * Remove the env var after the first successful deploy to disable this.
 *
 * Deletes ALL runtime data (users, investments, income, transactions, etc.)
 * Preserves: admins, system_settings, salary_rank_config, company_wallets,
 *             withdrawal_settings.
 * Then creates the root "master" user who is the apex of the binary tree.
 */
export async function maybeResetForLaunch(): Promise<void> {
  if (process.env["RESET_FOR_LAUNCH"] !== "true") return;

  logger.warn("RESET_FOR_LAUNCH=true detected — starting pre-launch database reset");

  try {
    // Delete in FK-safe order inside a single interactive transaction
    await prisma.$transaction(
      async (tx) => {
        // Releases first (child of income_transfers)
        await tx.incomeTransferRelease.deleteMany();
        await tx.incomeTransfer.deleteMany();

        // Notification and log records
        await tx.notification.deleteMany();
        await tx.adminLog.deleteMany();

        // Salary derived records
        await tx.salaryIncome.deleteMany();
        await tx.salaryAchievement.deleteMany();

        // Binary income records
        await tx.binaryOrbitIncome.deleteMany();
        await tx.binaryMatchIncome.deleteMany();

        // BV ledgers (all depend on investments + users)
        await tx.bvHistory.deleteMany();
        await tx.salaryBvLedger.deleteMany();
        await tx.orbitBvLedger.deleteMany();
        await tx.matchBvLedger.deleteMany();

        // Level income
        await tx.levelIncome.deleteMany();

        // ROI ledger (depends on investments)
        await tx.roiLedger.deleteMany();

        // Investments
        await tx.investment.deleteMany();

        // Deposits and withdrawals
        await tx.withdrawalRequest.deleteMany();
        await tx.depositRequest.deleteMany();

        // Wallet transactions before wallets
        await tx.walletTransaction.deleteMany();

        // Referral history
        await tx.referralHistory.deleteMany();

        // Wallets (cascade-deletes from users but safe to delete first)
        await tx.wallet.deleteMany();

        // Clear self-referencing columns on users, then delete
        await tx.$executeRaw`
          UPDATE users
          SET "sponsorId" = NULL,
              "binaryParentId" = NULL,
              "leftDeepestNodeId" = NULL,
              "rightDeepestNodeId" = NULL
        `;
        await tx.user.deleteMany();

        // Job logs have no user FK — delete standalone
        await tx.jobExecutionLog.deleteMany();

        // Create master root user
        const passwordHash = await bcrypt.hash(MASTER_PASSWORD, 12);

        await tx.user.create({
          data: {
            id: MASTER_USER_ID,
            email: MASTER_EMAIL,
            username: MASTER_USERNAME,
            passwordHash,
            firstName: "Master",
            lastName: "ID",
            status: "ACTIVE",
            referralCode: MASTER_REFERRAL_CODE,
            isTestUser: false,
            // No sponsor, no binary parent — this IS the root
            wallet: {
              create: {
                id: MASTER_WALLET_ID,
                depositWallet: 0,
                incomeWallet: 0,
                withdrawalWallet: 0,
                lockedWithdrawalBalance: 0,
              },
            },
          },
        });

        logger.info("Master root user created: username=master email=master@primewave.io referralCode=MASTERROOT");
      },
      { timeout: 30_000 },
    );

    logger.info("RESET_FOR_LAUNCH complete — database is clean, master user exists. Remove RESET_FOR_LAUNCH env var now.");
  } catch (err) {
    logger.error({ err }, "RESET_FOR_LAUNCH failed — server will continue but database may be in a partial state");
  }
}
