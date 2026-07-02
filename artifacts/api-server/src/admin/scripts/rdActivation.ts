/**
 * Prime Wave RD Activation — Sprint 28K
 *
 * Activates all 64 RD accounts so they become fully operational members.
 *
 * ACTIVATION FLOW (per RD):
 *   Step 1 — Manual admin deposit of $100 via createManualAdminDeposit().
 *             Produces: DepositRequest (APPROVED) + WalletTransaction + AdminLog.
 *   Step 2 — Investment of $100 via createInvestment() — same code path as a
 *             real member making their first investment.
 *             Produces: Investment (ACTIVE) + BV propagation + Level Income.
 *
 * IDEMPOTENCY:
 *   Skip any RD that already has an ACTIVE investment of exactly $100.
 *   Safe to run multiple times without double-crediting.
 *
 * SCOPE:
 *   Master and MI accounts: UNTOUCHED.
 *   SP accounts:            UNTOUCHED.
 *   Only users whose username matches rd####.
 *
 * BINARY QUALIFICATION AFTER ACTIVATION:
 *   Each RD already has directLeftCount=50, directRightCount=50 (50 SPs per side).
 *   After a $100 ACTIVE investment they satisfy isBinaryQualified() immediately.
 *
 * EXECUTION:
 *   pnpm --filter @workspace/api-server run activate-rds
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { createManualAdminDeposit } from "../admin-deposits.service.js";
import { createInvestment } from "../../investments/investments.service.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ID       = "6f67dde8-f7c6-4fff-8042-b28dd50191d7";
const DEPOSIT_AMOUNT = 100;
const INVEST_AMOUNT  = 100;
const PLAN_TYPE      = "PLAN_360" as const;
const REASON         = "RD Activation — Sprint 28K: First qualifying investment";

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getBinaryQualified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      directLeftCount:  true,
      directRightCount: true,
      investments: {
        where:  { status: "ACTIVE", amount: { gte: new Prisma.Decimal("100") } },
        select: { id: true },
        take:   1,
      },
    },
  });
  if (!user) return false;
  return (
    user.directLeftCount  >= 1 &&
    user.directRightCount >= 1 &&
    user.investments.length > 0
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log("═══════════════════════════════════════════════════════");
  log("  RD ACTIVATION — Sprint 28K");
  log("═══════════════════════════════════════════════════════");

  // ── Fetch all RD accounts ─────────────────────────────────────────────────
  const rdUsers = await prisma.user.findMany({
    where:   { username: { startsWith: "rd", endsWith: "@primewave.network".slice(-1) === "k" ? undefined : undefined } },
    select:  {
      id:               true,
      username:         true,
      status:           true,
      directLeftCount:  true,
      directRightCount: true,
      wallet: { select: { depositWallet: true } },
      investments: {
        where:  { status: "ACTIVE" },
        select: { id: true, amount: true },
        take:   1,
      },
    },
    orderBy: { username: "asc" },
  });

  // Filter to only rd#### pattern (excludes master, mi, sp)
  const rds = rdUsers.filter(u => /^rd\d{4}$/.test(u.username));
  log(`Found ${rds.length} RD accounts`);

  // ── Activation loop ───────────────────────────────────────────────────────
  let activated   = 0;
  let skipped     = 0;
  let errors      = 0;
  let totalDeposited = new Prisma.Decimal(0);
  let totalInvested  = new Prisma.Decimal(0);

  const results: Array<{
    username: string;
    action:   string;
    error?:   string;
  }> = [];

  for (const rd of rds) {
    // Idempotency: skip if already has an active investment ≥ $100
    if (rd.investments.length > 0) {
      log(`  SKIP ${rd.username} — already has ACTIVE investment`);
      skipped++;
      results.push({ username: rd.username, action: "SKIPPED (already active)" });
      continue;
    }

    log(`  → ${rd.username} (L=${rd.directLeftCount} R=${rd.directRightCount})`);

    try {
      // Step 1: Manual admin deposit of $100
      await createManualAdminDeposit(ADMIN_ID, {
        userId:  rd.id,
        amount:  DEPOSIT_AMOUNT,
        network: "BEP20",
        reason:  REASON,
        notes:   "Automated RD activation — Sprint 28K",
      });
      log(`    ✓ Deposit $${DEPOSIT_AMOUNT} credited to deposit wallet`);
      totalDeposited = totalDeposited.plus(DEPOSIT_AMOUNT);

      // Step 2: Create investment via normal member flow
      await createInvestment(rd.id, {
        amount:      INVEST_AMOUNT,
        planType:    PLAN_TYPE,
        autoCompound: false,
      });
      log(`    ✓ Investment $${INVEST_AMOUNT} (${PLAN_TYPE}) created`);
      totalInvested = totalInvested.plus(INVEST_AMOUNT);

      // Step 3: Promote from placeholder → live member.
      // Only flip INACTIVE → ACTIVE. Never overwrite SUSPENDED or BLOCKED.
      if (rd.status === "INACTIVE") {
        await prisma.user.update({
          where: { id: rd.id },
          data:  { status: "ACTIVE" },
        });
        log(`    ✓ users.status INACTIVE → ACTIVE`);
      }

      activated++;
      results.push({ username: rd.username, action: "ACTIVATED" });
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      log(`    ✗ ERROR: ${msg}`);
      results.push({ username: rd.username, action: "ERROR", error: msg });
    }
  }

  // ── Post-activation verification ─────────────────────────────────────────
  log("");
  log("═══════════════════════════════════════════════════════");
  log("  POST-ACTIVATION VERIFICATION");
  log("═══════════════════════════════════════════════════════");

  const verified = await prisma.user.findMany({
    where:   { username: { in: rds.map(r => r.username) } },
    select:  {
      id:       true,
      username: true,
      wallet:   { select: { depositWallet: true } },
      investments: {
        where:  { status: "ACTIVE" },
        select: { id: true, amount: true, planType: true },
      },
    },
    orderBy: { username: "asc" },
  });

  const rdVerified     = verified.filter(u => /^rd\d{4}$/.test(u.username));
  const withActiveInv  = rdVerified.filter(u => u.investments.length > 0);
  const depositZero    = rdVerified.filter(u => u.wallet?.depositWallet.equals(new Prisma.Decimal(0)) ?? false);
  let   qualifiedCount = 0;

  for (const u of rdVerified) {
    const q = await getBinaryQualified(u.id);
    if (q) qualifiedCount++;
  }

  const totalInvAmt = withActiveInv.reduce((acc, u) => {
    const inv = u.investments[0];
    return inv ? acc.plus(inv.amount) : acc;
  }, new Prisma.Decimal(0));

  log("");
  log("  RESULTS");
  log(`  ─────────────────────────────────────────`);
  log(`  RD accounts total      : ${rds.length}`);
  log(`  Activated this run     : ${activated}`);
  log(`  Skipped (already done) : ${skipped}`);
  log(`  Errors                 : ${errors}`);
  log(`  ─────────────────────────────────────────`);
  log(`  Active Investments     : ${withActiveInv.length} / ${rds.length}`);
  log(`  Total RD invested      : $${totalInvAmt.toFixed(2)}`);
  log(`  Deposit Wallet = $0    : ${depositZero.length} / ${rds.length}`);
  log(`  Binary Qualified       : ${qualifiedCount} / ${rds.length}`);
  log(`  ─────────────────────────────────────────`);
  log(`  Total deposited        : $${totalDeposited.toFixed(2)}`);
  log(`  Total invested         : $${totalInvested.toFixed(2)}`);

  if (errors > 0) {
    log("");
    log("  ERRORS DETAIL:");
    for (const r of results.filter(x => x.action === "ERROR")) {
      log(`    ${r.username}: ${r.error}`);
    }
  }

  log("");
  log("═══════════════════════════════════════════════════════");

  // Exit code reflects errors
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
