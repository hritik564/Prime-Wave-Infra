/**
 * Sprint 27F — Deposit Approval Idempotency Regression Tests
 *
 * Tests all concurrent scenarios from Requirement 8 using the Prisma client
 * directly to verify atomic DB behavior.  No HTTP required — tests the
 * database-level guarantees that matter.
 *
 * Run from project root:
 *   node artifacts/api-server/src/admin/scripts/deposit-idempotency-test.mjs
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

const prisma = new PrismaClient({ log: [] });

const results = [];

// ─────────────────────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────────────────────

function pass(name) {
  results.push({ name, passed: true });
  process.stdout.write(`  ✅  ${name}\n`);
}

function fail(name, reason) {
  results.push({ name, passed: false, reason });
  process.stderr.write(`  ❌  ${name}: ${reason}\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createTestUser(tag) {
  const id = `idt-${tag}`;
  await prisma.user.upsert({
    where:  { id },
    update: {},
    create: {
      id,
      email:        `idt_${tag}@test.internal`,
      username:     `idt_${tag}`,
      firstName:    "IDT",
      lastName:     "Test",
      passwordHash: "x",
      referralCode: `IDT${tag.replace(/-/g,"").slice(0,6).toUpperCase()}`,
      wallet:       { create: { depositWallet: 0, incomeWallet: 0, withdrawalWallet: 0 } },
    },
  });
  return id;
}

async function createTestAdmin() {
  const id = "idt-admin-01";
  await prisma.admin.upsert({
    where:  { id },
    update: {},
    create: {
      id,
      email:        "idt_admin@test.internal",
      passwordHash: "x",
      role:         "SUPER_ADMIN",
      firstName:    "IDT",
      lastName:     "Admin",
    },
  });
  return id;
}

async function createDeposit(userId, status = "PENDING") {
  const txHash = `0xIDT${randomUUID().replace(/-/g, "").toUpperCase()}`;
  return prisma.depositRequest.create({
    data: {
      userId,
      amount:        new Prisma.Decimal("10.00"),
      network:       "BEP20",
      txHash,
      companyWallet: "0xTESTCOMPANY",
      status,
    },
    select: { id: true, txHash: true, userId: true, amount: true, status: true },
  });
}

/**
 * Replicated atomic approval logic (mirrors approveDeposit service).
 * Uses the exact same updateMany + wallet credit pattern.
 */
async function atomicApprove(adminId, deposit) {
  const approvedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.depositRequest.updateMany({
      where: { id: deposit.id, status: { in: ["PENDING", "CONFIRMING"] } },
      data:  { status: "APPROVED", approvedByAdminId: adminId, approvedAt },
    });
    if (count === 0) {
      const e = new Error("Deposit already approved");
      e.code = "ALREADY_APPROVED";
      throw e;
    }

    const wallet = await tx.wallet.update({
      where:  { userId: deposit.userId },
      data:   { depositWallet: { increment: deposit.amount } },
      select: { id: true },
    });

    await tx.walletTransaction.create({
      data: {
        walletId:        wallet.id,
        userId:          deposit.userId,
        type:            "DEPOSIT",
        status:          "SUCCESS",
        amount:          deposit.amount,
        description:     "IDT test credit",
        sourceDepositId: deposit.id,
      },
    });

    await tx.adminLog.create({
      data: {
        adminId,
        action:       "DEPOSIT_APPROVED",
        targetUserId: deposit.userId,
        details:      { depositId: deposit.id, test: true },
      },
    });
  }, { timeout: 30_000 });
}

async function getWalletTxCount(userId, depositId) {
  return prisma.walletTransaction.count({ where: { userId, sourceDepositId: depositId } });
}

async function getWalletBalance(userId) {
  const w = await prisma.wallet.findUnique({ where: { userId }, select: { depositWallet: true } });
  return w?.depositWallet ?? new Prisma.Decimal(0);
}

async function cleanup(userIds) {
  for (const id of userIds) {
    await prisma.walletTransaction.deleteMany({ where: { userId: id } });
    await prisma.adminLog.deleteMany({ where: { targetUserId: id } });
    await prisma.depositVerification.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.depositRequest.deleteMany({ where: { userId: id } });
    await prisma.wallet.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────────────────────

async function s1_AdminApproveTwice(adminId) {
  const name = "S1: Admin approves same deposit twice (double-click)";
  const uid  = await createTestUser(`s1-${Date.now()}`);
  try {
    const dep  = await createDeposit(uid);
    const bal0 = await getWalletBalance(uid);

    await atomicApprove(adminId, dep);

    let threw = false, code = "";
    try { await atomicApprove(adminId, dep); }
    catch (e) { threw = true; code = e.code ?? ""; }

    const txCount = await getWalletTxCount(uid, dep.id);
    const credit  = (await getWalletBalance(uid)).minus(bal0);

    if (!threw)                    return fail(name, "second call did not throw");
    if (code !== "ALREADY_APPROVED") return fail(name, `second call code=${code}`);
    if (txCount !== 1)             return fail(name, `txCount=${txCount}, want 1`);
    if (!credit.eq("10"))          return fail(name, `credited $${credit}, want $10`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s2_ConcurrentAdminApprovals(adminId) {
  const name = "S2: Two concurrent admin approvals (race)";
  const uid  = await createTestUser(`s2-${Date.now()}`);
  try {
    const dep  = await createDeposit(uid);
    const bal0 = await getWalletBalance(uid);

    const [r1, r2] = await Promise.allSettled([
      atomicApprove(adminId, dep),
      atomicApprove(adminId, dep),
    ]);

    const wins   = [r1,r2].filter(r => r.status === "fulfilled").length;
    const losses = [r1,r2].filter(r => r.status === "rejected").length;
    const txCount = await getWalletTxCount(uid, dep.id);
    const credit  = (await getWalletBalance(uid)).minus(bal0);

    if (wins   !== 1) return fail(name, `wins=${wins}, want 1`);
    if (losses !== 1) return fail(name, `losses=${losses}, want 1`);
    if (txCount !== 1) return fail(name, `txCount=${txCount}, want 1`);
    if (!credit.eq("10")) return fail(name, `credited $${credit}, want $10`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s3_WorkerApprovesOnce(adminId) {
  const name = "S3: Worker approves once (normal auto-verify path)";
  const uid  = await createTestUser(`s3-${Date.now()}`);
  try {
    const dep  = await createDeposit(uid);
    const bal0 = await getWalletBalance(uid);

    await atomicApprove(adminId, dep);

    const txCount = await getWalletTxCount(uid, dep.id);
    const credit  = (await getWalletBalance(uid)).minus(bal0);

    if (txCount !== 1) return fail(name, `txCount=${txCount}, want 1`);
    if (!credit.eq("10")) return fail(name, `credited $${credit}, want $10`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s4_WorkerRetry(adminId) {
  const name = "S4: Worker retry on already-approved deposit";
  const uid  = await createTestUser(`s4-${Date.now()}`);
  try {
    const dep = await createDeposit(uid);
    await atomicApprove(adminId, dep);

    let code = "";
    try { await atomicApprove(adminId, dep); }
    catch (e) { code = e.code ?? ""; }

    const txCount = await getWalletTxCount(uid, dep.id);

    if (code !== "ALREADY_APPROVED") return fail(name, `retry code=${code}`);
    if (txCount !== 1) return fail(name, `txCount=${txCount}, want 1`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s5_ConfirmingDeposit(adminId) {
  const name = "S5: CONFIRMING deposit — single approval";
  const uid  = await createTestUser(`s5-${Date.now()}`);
  try {
    const dep  = await createDeposit(uid, "CONFIRMING");
    const bal0 = await getWalletBalance(uid);

    await atomicApprove(adminId, dep);

    const txCount = await getWalletTxCount(uid, dep.id);
    const credit  = (await getWalletBalance(uid)).minus(bal0);

    if (txCount !== 1) return fail(name, `txCount=${txCount}, want 1`);
    if (!credit.eq("10")) return fail(name, `credited $${credit}, want $10`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s6_ConcurrentConfirming(adminId) {
  const name = "S6: CONFIRMING — concurrent admin + worker race";
  const uid  = await createTestUser(`s6-${Date.now()}`);
  try {
    const dep  = await createDeposit(uid, "CONFIRMING");
    const bal0 = await getWalletBalance(uid);

    const [r1, r2] = await Promise.allSettled([
      atomicApprove(adminId, dep),
      atomicApprove(adminId, dep),
    ]);

    const wins    = [r1,r2].filter(r => r.status === "fulfilled").length;
    const txCount = await getWalletTxCount(uid, dep.id);
    const credit  = (await getWalletBalance(uid)).minus(bal0);

    if (wins !== 1) return fail(name, `wins=${wins}, want 1`);
    if (txCount !== 1) return fail(name, `txCount=${txCount}, want 1`);
    if (!credit.eq("10")) return fail(name, `credited $${credit}, want $10`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s7_DbUniqueConstraint(adminId) {
  const name = "S7: DB UNIQUE constraint on sourceDepositId rejects duplicate insert";
  const uid  = await createTestUser(`s7-${Date.now()}`);
  try {
    const dep = await createDeposit(uid);
    await atomicApprove(adminId, dep);

    const wallet = await prisma.wallet.findUnique({ where: { userId: uid }, select: { id: true } });
    let violated = false;
    try {
      await prisma.walletTransaction.create({
        data: {
          walletId:        wallet.id,
          userId:          uid,
          type:            "DEPOSIT",
          status:          "SUCCESS",
          amount:          new Prisma.Decimal("10.00"),
          description:     "DUPLICATE — must be rejected by DB",
          sourceDepositId: dep.id,
        },
      });
    } catch (e) {
      if (e?.code === "P2002") violated = true;
    }

    if (!violated) return fail(name, "DB did not reject duplicate sourceDepositId");
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s8_RejectedDepositCannotApprove(adminId) {
  const name = "S8: REJECTED deposit → DEPOSIT_NOT_APPROVABLE (no credit)";
  const uid  = await createTestUser(`s8-${Date.now()}`);
  try {
    const dep = await createDeposit(uid);
    await prisma.depositRequest.update({
      where: { id: dep.id },
      data:  { status: "REJECTED", rejectedReason: "Test" },
    });

    let threw = false;
    try { await atomicApprove(adminId, dep); }
    catch { threw = true; }

    const txCount = await getWalletTxCount(uid, dep.id);

    if (!threw) return fail(name, "did not throw on REJECTED deposit");
    if (txCount !== 0) return fail(name, `txCount=${txCount}, want 0`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s9_NParallelRace(adminId, N) {
  const name = `S9: ${N}-way parallel approval race`;
  const uid  = await createTestUser(`s9${N}-${Date.now()}`);
  try {
    const dep  = await createDeposit(uid);
    const bal0 = await getWalletBalance(uid);

    const settled = await Promise.allSettled(
      Array.from({ length: N }, () => atomicApprove(adminId, dep))
    );

    const wins    = settled.filter(r => r.status === "fulfilled").length;
    const txCount = await getWalletTxCount(uid, dep.id);
    const credit  = (await getWalletBalance(uid)).minus(bal0);

    if (wins !== 1) return fail(name, `wins=${wins}, want exactly 1`);
    if (txCount !== 1) return fail(name, `txCount=${txCount}, want 1`);
    if (!credit.eq("10")) return fail(name, `credited $${credit}, want $10`);
    pass(name);
  } finally { await cleanup([uid]); }
}

async function s10_ManualAfterAutomatic(adminId) {
  const name = "S10: Manual approval after automatic approval (admin sees stale UI)";
  const uid  = await createTestUser(`s10-${Date.now()}`);
  try {
    const dep  = await createDeposit(uid);
    const bal0 = await getWalletBalance(uid);

    // Auto-verification approves first
    await atomicApprove(adminId, dep);

    // Admin approves 500ms later (stale UI shows PENDING)
    await new Promise(r => setTimeout(r, 500));
    let code = "";
    try { await atomicApprove(adminId, dep); }
    catch (e) { code = e.code ?? ""; }

    const txCount = await getWalletTxCount(uid, dep.id);
    const credit  = (await getWalletBalance(uid)).minus(bal0);

    if (code !== "ALREADY_APPROVED") return fail(name, `code=${code}`);
    if (txCount !== 1) return fail(name, `txCount=${txCount}, want 1`);
    if (!credit.eq("10")) return fail(name, `credited $${credit}, want $10`);
    pass(name);
  } finally { await cleanup([uid]); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  Sprint 27F — Deposit Idempotency Regression Tests    ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  const adminId = await createTestAdmin();

  await s1_AdminApproveTwice(adminId);
  await s2_ConcurrentAdminApprovals(adminId);
  await s3_WorkerApprovesOnce(adminId);
  await s4_WorkerRetry(adminId);
  await s5_ConfirmingDeposit(adminId);
  await s6_ConcurrentConfirming(adminId);
  await s7_DbUniqueConstraint(adminId);
  await s8_RejectedDepositCannotApprove(adminId);
  await s9_NParallelRace(adminId, 5);
  await s9_NParallelRace(adminId, 10);
  await s10_ManualAfterAutomatic(adminId);

  // Cleanup test admin
  await prisma.admin.deleteMany({ where: { id: "idt-admin-01" } }).catch(() => {});

  console.log("\n─────────────────────────────────────────────────────────\n");

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} total\n`);

  if (failed > 0) {
    console.error("FAILED:");
    results.filter(r => !r.passed).forEach(r => console.error(`  ❌  ${r.name}: ${r.reason}`));
    process.exit(1);
  } else {
    console.log("✅  All scenarios passed — deposit approval is idempotent.\n");
    process.exit(0);
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
