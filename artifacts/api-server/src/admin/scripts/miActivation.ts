/**
 * Prime Wave MI Activation — Sprint 29E
 *
 * Activates all 63 MI (Master Infrastructure) accounts using the standard
 * business flow. Fully idempotent — safe to run multiple times.
 *
 * ACTIVATION FLOW (per MI account):
 *
 *   Step 1 — Already has ACTIVE investment:
 *             Skip deposit + investment creation.
 *             If users.status = INACTIVE → update to ACTIVE.
 *
 *   Step 2 — No ACTIVE investment, depositWallet >= $100:
 *             Use existing deposit wallet balance.
 *             Create $100 investment via createInvestment().
 *             Update users.status to ACTIVE.
 *
 *   Step 3 — No ACTIVE investment, depositWallet < $100:
 *             Create manual admin deposit of $100 via createManualAdminDeposit().
 *             Create $100 investment via createInvestment().
 *             Update users.status to ACTIVE.
 *
 * IDEMPOTENCY:
 *   - An MI with an ACTIVE investment is never re-deposited or re-invested.
 *   - Status update only fires when users.status = INACTIVE.
 *   - Running twice produces zero duplicate records.
 *
 * SCOPE:
 *   Only usernames matching ^mi\d+$ are touched.
 *   Master, RD, SP, and normal users are never affected.
 *
 * EXECUTION:
 *   pnpm --filter @workspace/api-server run activate-mis
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { createManualAdminDeposit } from "../admin-deposits.service.js";
import { createInvestment } from "../../investments/investments.service.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const ADMIN_ID       = "6f67dde8-f7c6-4fff-8042-b28dd50191d7";
const DEPOSIT_AMOUNT = 100;
const INVEST_AMOUNT  = 100;
const PLAN_TYPE      = "PLAN_360" as const;
const REASON         = "MI Activation — Sprint 29E: First qualifying investment";
const MI_PATTERN     = /^mi\d+$/;

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log("═══════════════════════════════════════════════════════");
  log("  MI ACTIVATION — Sprint 29E");
  log("═══════════════════════════════════════════════════════");

  // ── Fetch all MI accounts ─────────────────────────────────────────────────
  const miUsers = await prisma.user.findMany({
    where:   { username: { startsWith: "mi" } },
    select:  {
      id:               true,
      username:         true,
      status:           true,
      directLeftCount:  true,
      directRightCount: true,
      wallet: {
        select: { depositWallet: true },
      },
      investments: {
        where:  { status: "ACTIVE" },
        select: { id: true, amount: true },
        take:   1,
      },
    },
    orderBy: { username: "asc" },
  });

  const mis = miUsers.filter(u => MI_PATTERN.test(u.username));
  log(`Found ${mis.length} MI accounts`);
  log("");

  // ── Counters ──────────────────────────────────────────────────────────────
  let alreadyInvested   = 0;
  let investedThisRun   = 0;
  let depositsCreated   = 0;
  let statusUpdates     = 0;
  let skipped           = 0;
  let errors            = 0;

  const results: Array<{ username: string; action: string; error?: string }> = [];

  // ── Activation loop ───────────────────────────────────────────────────────
  for (const mi of mis) {
    const hasActiveInv    = mi.investments.length > 0;
    const depositBalance  = mi.wallet?.depositWallet ?? new Prisma.Decimal(0);
    const needsDeposit    = depositBalance.lessThan(new Prisma.Decimal(DEPOSIT_AMOUNT));

    // ── STEP 1: Already has ACTIVE investment ─────────────────────────────
    if (hasActiveInv) {
      alreadyInvested++;
      if (mi.status === "INACTIVE") {
        try {
          await prisma.user.update({
            where: { id: mi.id },
            data:  { status: "ACTIVE" },
          });
          statusUpdates++;
          log(`  STEP1 ${mi.username} — had investment; INACTIVE → ACTIVE`);
          results.push({ username: mi.username, action: "STATUS_UPDATED (had investment)" });
        } catch (err) {
          errors++;
          const msg = err instanceof Error ? err.message : String(err);
          log(`  ✗ ${mi.username} status update ERROR: ${msg}`);
          results.push({ username: mi.username, action: "ERROR (status update)", error: msg });
        }
      } else {
        skipped++;
        log(`  SKIP ${mi.username} — already has ACTIVE investment, status=${mi.status}`);
        results.push({ username: mi.username, action: `SKIPPED (inv+status=${mi.status})` });
      }
      continue;
    }

    // ── STEP 3: Deposit wallet < $100 — create manual admin deposit ───────
    if (needsDeposit) {
      log(`  STEP3 ${mi.username} — depositWallet=$${depositBalance.toFixed(2)}, creating deposit…`);
      try {
        await createManualAdminDeposit(ADMIN_ID, {
          userId:  mi.id,
          amount:  DEPOSIT_AMOUNT,
          network: "BEP20",
          reason:  REASON,
          notes:   "Automated MI activation — Sprint 29E",
        });
        depositsCreated++;
        log(`    ✓ Manual deposit $${DEPOSIT_AMOUNT} created`);
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        log(`    ✗ Deposit ERROR for ${mi.username}: ${msg}`);
        results.push({ username: mi.username, action: "ERROR (deposit)", error: msg });
        continue;
      }
    } else {
      log(`  STEP2 ${mi.username} — depositWallet=$${depositBalance.toFixed(2)}, using existing balance…`);
    }

    // ── STEP 2 / post-STEP 3: Create investment ───────────────────────────
    try {
      await createInvestment(mi.id, {
        amount:       INVEST_AMOUNT,
        planType:     PLAN_TYPE,
        autoCompound: false,
      });
      investedThisRun++;
      log(`    ✓ Investment $${INVEST_AMOUNT} (${PLAN_TYPE}) created`);
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      log(`    ✗ Investment ERROR for ${mi.username}: ${msg}`);
      results.push({ username: mi.username, action: "ERROR (investment)", error: msg });
      continue;
    }

    // ── Status update ─────────────────────────────────────────────────────
    if (mi.status === "INACTIVE") {
      try {
        await prisma.user.update({
          where: { id: mi.id },
          data:  { status: "ACTIVE" },
        });
        statusUpdates++;
        log(`    ✓ users.status INACTIVE → ACTIVE`);
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        log(`    ✗ Status update ERROR for ${mi.username}: ${msg}`);
        results.push({ username: mi.username, action: "ERROR (status)", error: msg });
        continue;
      }
    }

    results.push({
      username: mi.username,
      action: needsDeposit ? "ACTIVATED (deposit+investment+status)" : "ACTIVATED (investment+status)",
    });
  }

  // ── Post-activation verification ──────────────────────────────────────────
  log("");
  log("═══════════════════════════════════════════════════════");
  log("  POST-ACTIVATION VERIFICATION");
  log("═══════════════════════════════════════════════════════");

  const verified = await prisma.user.findMany({
    where:   { username: { in: mis.map(m => m.username) } },
    select:  {
      username: true,
      status:   true,
      directLeftCount:  true,
      directRightCount: true,
      investments: {
        where:  { status: "ACTIVE" },
        select: { id: true, amount: true },
        take:   1,
      },
    },
    orderBy: { username: "asc" },
  });

  const miVerified          = verified.filter(u => MI_PATTERN.test(u.username));
  const nowWithActiveInv    = miVerified.filter(u => u.investments.length > 0);
  const nowStatusActive     = miVerified.filter(u => u.status === "ACTIVE");
  const nowOperational      = miVerified.filter(u =>
    u.investments.length > 0 &&
    u.directLeftCount  >= 1 &&
    u.directRightCount >= 1
  );

  log("");
  log("  RESULTS SUMMARY");
  log("  ─────────────────────────────────────────────────────");
  log(`  MI accounts total          : ${mis.length}`);
  log(`  Already had investment     : ${alreadyInvested}`);
  log(`  Invested this run          : ${investedThisRun}`);
  log(`  Manual deposits created    : ${depositsCreated}`);
  log(`  Status updates (→ ACTIVE)  : ${statusUpdates}`);
  log(`  Skipped (fully done)       : ${skipped}`);
  log(`  Errors                     : ${errors}`);
  log("  ─────────────────────────────────────────────────────");
  log(`  Now with ACTIVE investment : ${nowWithActiveInv.length} / ${mis.length}`);
  log(`  Now users.status = ACTIVE  : ${nowStatusActive.length} / ${mis.length}`);
  log(`  Now operationally ACTIVE   : ${nowOperational.length} / ${mis.length}`);
  log("  ─────────────────────────────────────────────────────");

  if (errors > 0) {
    log("");
    log("  ERRORS DETAIL:");
    for (const r of results.filter(x => x.action.includes("ERROR"))) {
      log(`    ${r.username}: ${r.error}`);
    }
    log("");
    log("  ⚠ Script completed with errors — review above before re-running.");
  } else {
    log("");
    log("  ✓ All MI accounts processed successfully.");
    log("  ✓ Script is idempotent — safe to run again.");
  }

  log("");
  log("═══════════════════════════════════════════════════════");

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
