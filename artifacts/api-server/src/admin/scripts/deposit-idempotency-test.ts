/**
 * Sprint 27F — Deposit Approval Idempotency Regression Test
 *
 * Tests every concurrent scenario from Requirement 8.
 * Run against the dev database only:
 *
 *   pnpm --filter @workspace/api-server exec ts-node \
 *     src/admin/scripts/deposit-idempotency-test.ts
 *
 * Each scenario creates isolated test data, runs the scenario, asserts the
 * invariants, and cleans up.  Failures are reported at the end.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { approveDeposit } from "../admin-deposits.service";
import { randomUUID } from "crypto";

const prisma = new PrismaClient({ log: [] });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const results: { scenario: string; passed: boolean; error?: string }[] = [];

function pass(scenario: string) {
  results.push({ scenario, passed: true });
  console.log(`  ✅  ${scenario}`);
}

function fail(scenario: string, error: string) {
  results.push({ scenario, passed: false, error });
  console.error(`  ❌  ${scenario}: ${error}`);
}

async function createTestUser(suffix: string) {
  const id       = `test-user-${suffix}`;
  const username = `idempotency_test_${suffix}`;

  const user = await prisma.user.upsert({
    where:  { id },
    update: {},
    create: {
      id,
      email:        `idempotency_test_${suffix}@test.internal`,
      username,
      firstName:    "IDT",
      lastName:     "Test",
      passwordHash: "x",
      referralCode: `IDPTEST${suffix.toUpperCase().slice(0, 6)}`,
      wallet: { create: { depositWallet: 0, incomeWallet: 0, withdrawalWallet: 0 } },
    },
    select: { id: true },
  });
  return user.id;
}

async function createTestAdmin() {
  const id = "test-admin-idempotency";
  await prisma.admin.upsert({
    where:  { id },
    update: {},
    create: {
      id,
      email:        "idempotency_admin@test.internal",
      passwordHash: "x",
      role:         "SUPER_ADMIN",
      firstName:    "Test",
      lastName:     "Admin",
    },
  });
  return id;
}

async function createDeposit(userId: string, status: "PENDING" | "CONFIRMING" = "PENDING") {
  const txHash = `0xTEST${randomUUID().replace(/-/g, "").slice(0, 60)}`;
  const deposit = await prisma.depositRequest.create({
    data: {
      userId,
      amount:        new Prisma.Decimal("10.00"),
      network:       "BEP20",
      txHash,
      companyWallet: "0xTESTCOMPANY",
      status,
    },
    select: { id: true, txHash: true },
  });
  return deposit;
}

async function getWalletTxCount(userId: string, depositId: string): Promise<number> {
  return prisma.walletTransaction.count({
    where: { userId, sourceDepositId: depositId },
  });
}

async function getWalletBalance(userId: string): Promise<Prisma.Decimal> {
  const w = await prisma.wallet.findUnique({
    where:  { userId },
    select: { depositWallet: true },
  });
  return w?.depositWallet ?? new Prisma.Decimal(0);
}

async function getAdminLogCount(depositId: string): Promise<number> {
  const logs = await prisma.adminLog.findMany({
    where: {
      action:  "DEPOSIT_APPROVED",
      details: { path: ["depositId"], equals: depositId },
    },
  });
  return logs.length;
}

async function cleanup(userIds: string[]) {
  for (const userId of userIds) {
    await prisma.walletTransaction.deleteMany({ where: { userId } });
    await prisma.adminLog.deleteMany({ where: { targetUserId: userId } });
    await prisma.depositRequest.deleteMany({ where: { userId } });
    await prisma.depositVerification.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.wallet.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────────────────────

/**
 * S1: Admin approves twice (double-click or network retry).
 * Expected: exactly one credit, second call returns ALREADY_APPROVED.
 */
async function scenarioAdminApproveTwice(adminId: string) {
  const name   = "S1: Admin approves twice (double-click)";
  const userId = await createTestUser(`s1-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId);
    const balanceBefore = await getWalletBalance(userId);

    // First approval — must succeed
    await approveDeposit(adminId, depositId);

    // Second approval — must throw ALREADY_APPROVED (409)
    let secondThrew = false;
    let secondCode  = "";
    try {
      await approveDeposit(adminId, depositId);
    } catch (e: unknown) {
      secondThrew = true;
      secondCode  = (e as { code?: string }).code ?? "";
    }

    const txCount       = await getWalletTxCount(userId, depositId);
    const balanceAfter  = await getWalletBalance(userId);
    const creditAmount  = balanceAfter.minus(balanceBefore);
    const adminLogCount = await getAdminLogCount(depositId);

    if (!secondThrew)           return fail(name, "second approval did not throw");
    if (secondCode !== "ALREADY_APPROVED") return fail(name, `second approval code was ${secondCode}`);
    if (txCount !== 1)          return fail(name, `expected 1 wallet tx, got ${txCount}`);
    if (!creditAmount.eq("10")) return fail(name, `expected credit $10, got $${creditAmount}`);
    if (adminLogCount !== 1)    return fail(name, `expected 1 audit log, got ${adminLogCount}`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S2: Concurrent admin approvals (simulating two requests landing at the same time).
 * Expected: exactly one wins, one gets ALREADY_APPROVED.
 */
async function scenarioConcurrentAdminApprovals(adminId: string) {
  const name   = "S2: Concurrent admin approvals (race)";
  const userId = await createTestUser(`s2-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId);
    const balanceBefore = await getWalletBalance(userId);

    // Fire both at exactly the same time
    const [r1, r2] = await Promise.allSettled([
      approveDeposit(adminId, depositId),
      approveDeposit(adminId, depositId),
    ]);

    const successes = [r1, r2].filter(r => r.status === "fulfilled").length;
    const failures  = [r1, r2].filter(r => r.status === "rejected").length;

    const txCount      = await getWalletTxCount(userId, depositId);
    const balanceAfter = await getWalletBalance(userId);
    const creditAmount = balanceAfter.minus(balanceBefore);

    if (successes !== 1)        return fail(name, `expected 1 success, got ${successes}`);
    if (failures  !== 1)        return fail(name, `expected 1 failure, got ${failures}`);
    if (txCount !== 1)          return fail(name, `expected 1 wallet tx, got ${txCount}`);
    if (!creditAmount.eq("10")) return fail(name, `expected credit $10, got $${creditAmount}`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S3: Worker calls approveDeposit once (normal auto-verification path).
 * Expected: one credit, deposit APPROVED.
 */
async function scenarioWorkerApprovesOnce(adminId: string) {
  const name   = "S3: Worker approves once (normal auto-verify)";
  const userId = await createTestUser(`s3-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId);
    const balanceBefore = await getWalletBalance(userId);

    await approveDeposit(adminId, depositId);

    const txCount      = await getWalletTxCount(userId, depositId);
    const balanceAfter = await getWalletBalance(userId);
    const creditAmount = balanceAfter.minus(balanceBefore);

    if (txCount !== 1)          return fail(name, `expected 1 wallet tx, got ${txCount}`);
    if (!creditAmount.eq("10")) return fail(name, `expected credit $10, got $${creditAmount}`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S4: Worker retries (calls approveDeposit on already-APPROVED deposit).
 * Expected: ALREADY_APPROVED, no second credit.
 */
async function scenarioWorkerRetry(adminId: string) {
  const name   = "S4: Worker retry (already-approved deposit)";
  const userId = await createTestUser(`s4-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId);
    await approveDeposit(adminId, depositId);

    // Simulate worker retry
    let retryCode = "";
    try {
      await approveDeposit(adminId, depositId);
    } catch (e: unknown) {
      retryCode = (e as { code?: string }).code ?? "";
    }

    const txCount = await getWalletTxCount(userId, depositId);

    if (retryCode !== "ALREADY_APPROVED") return fail(name, `retry code was '${retryCode}', expected ALREADY_APPROVED`);
    if (txCount !== 1) return fail(name, `expected 1 wallet tx, got ${txCount}`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S5: CONFIRMING deposit — worker or admin approves.
 * Expected: exactly one credit.
 */
async function scenarioConfirmingDeposit(adminId: string) {
  const name   = "S5: CONFIRMING deposit approval";
  const userId = await createTestUser(`s5-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId, "CONFIRMING");
    const balanceBefore = await getWalletBalance(userId);

    await approveDeposit(adminId, depositId);

    const txCount      = await getWalletTxCount(userId, depositId);
    const balanceAfter = await getWalletBalance(userId);
    const creditAmount = balanceAfter.minus(balanceBefore);

    if (txCount !== 1)          return fail(name, `expected 1 wallet tx, got ${txCount}`);
    if (!creditAmount.eq("10")) return fail(name, `expected credit $10, got $${creditAmount}`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S6: CONFIRMING → concurrent admin + worker race.
 * Expected: exactly one credit.
 */
async function scenarioConcurrentConfirming(adminId: string) {
  const name   = "S6: CONFIRMING concurrent admin + worker race";
  const userId = await createTestUser(`s6-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId, "CONFIRMING");
    const balanceBefore = await getWalletBalance(userId);

    const [r1, r2] = await Promise.allSettled([
      approveDeposit(adminId, depositId),
      approveDeposit(adminId, depositId),
    ]);

    const successes = [r1, r2].filter(r => r.status === "fulfilled").length;
    const txCount      = await getWalletTxCount(userId, depositId);
    const balanceAfter = await getWalletBalance(userId);
    const creditAmount = balanceAfter.minus(balanceBefore);

    if (successes !== 1)        return fail(name, `expected 1 success, got ${successes}`);
    if (txCount !== 1)          return fail(name, `expected 1 wallet tx, got ${txCount}`);
    if (!creditAmount.eq("10")) return fail(name, `expected credit $10, got $${creditAmount}`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S7: DB-level UNIQUE constraint — attempt to insert duplicate walletTransaction
 * with same sourceDepositId directly.
 * Expected: second insert is rejected by PostgreSQL.
 */
async function scenarioDbUniqueConstraint(adminId: string) {
  const name   = "S7: DB-level UNIQUE constraint on sourceDepositId";
  const userId = await createTestUser(`s7-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId);
    await approveDeposit(adminId, depositId);

    const wallet = await prisma.wallet.findUnique({
      where:  { userId },
      select: { id: true },
    });

    // Attempt a direct duplicate insert bypassing all application guards
    let constraintViolated = false;
    try {
      await prisma.walletTransaction.create({
        data: {
          walletId:        wallet!.id,
          userId,
          type:            "DEPOSIT",
          status:          "SUCCESS",
          amount:          new Prisma.Decimal("10.00"),
          description:     "DUPLICATE — must be rejected",
          sourceDepositId: depositId, // same sourceDepositId → constraint violation
        },
      });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "P2002") constraintViolated = true;
    }

    if (!constraintViolated) return fail(name, "DB did not reject duplicate sourceDepositId insert");

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S8: REJECTED deposit — approval must be rejected (not a double-credit risk
 * but verifies correct error code).
 */
async function scenarioRejectedDeposit(adminId: string) {
  const name   = "S8: REJECTED deposit cannot be approved (correct error code)";
  const userId = await createTestUser(`s8-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId);
    await prisma.depositRequest.update({
      where: { id: depositId },
      data:  { status: "REJECTED", rejectedReason: "Test rejection" },
    });

    let errorCode = "";
    try {
      await approveDeposit(adminId, depositId);
    } catch (e: unknown) {
      errorCode = (e as { code?: string }).code ?? "";
    }

    if (errorCode !== "DEPOSIT_NOT_APPROVABLE") return fail(name, `expected DEPOSIT_NOT_APPROVABLE, got '${errorCode}'`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

/**
 * S9: N parallel approvals (stress test, all racing).
 * Expected: exactly 1 success, N-1 failures, 1 wallet tx, correct balance.
 */
async function scenarioNParallelApprovals(adminId: string, N = 5) {
  const name   = `S9: ${N} parallel approvals (stress test)`;
  const userId = await createTestUser(`s9-${Date.now()}`);
  try {
    const { id: depositId } = await createDeposit(userId);
    const balanceBefore = await getWalletBalance(userId);

    const calls = Array.from({ length: N }, () => approveDeposit(adminId, depositId));
    const results = await Promise.allSettled(calls);

    const successes = results.filter(r => r.status === "fulfilled").length;
    const txCount      = await getWalletTxCount(userId, depositId);
    const balanceAfter = await getWalletBalance(userId);
    const creditAmount = balanceAfter.minus(balanceBefore);

    if (successes !== 1)        return fail(name, `expected 1 success, got ${successes}`);
    if (txCount !== 1)          return fail(name, `expected 1 wallet tx, got ${txCount}`);
    if (!creditAmount.eq("10")) return fail(name, `expected credit $10, got $${creditAmount}`);

    pass(name);
  } finally {
    await cleanup([userId]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Sprint 27F — Deposit Idempotency Regression Tests  ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const adminId = await createTestAdmin();

  await scenarioAdminApproveTwice(adminId);
  await scenarioConcurrentAdminApprovals(adminId);
  await scenarioWorkerApprovesOnce(adminId);
  await scenarioWorkerRetry(adminId);
  await scenarioConfirmingDeposit(adminId);
  await scenarioConcurrentConfirming(adminId);
  await scenarioDbUniqueConstraint(adminId);
  await scenarioRejectedDeposit(adminId);
  await scenarioNParallelApprovals(adminId, 5);
  await scenarioNParallelApprovals(adminId, 10);

  console.log("\n─────────────────────────────────────────────────────\n");

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error("FAILED SCENARIOS:");
    results.filter(r => !r.passed).forEach(r => console.error(`  ❌  ${r.scenario}: ${r.error}`));
    process.exit(1);
  } else {
    console.log("All scenarios passed — deposit approval pipeline is idempotent ✓");
    process.exit(0);
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
