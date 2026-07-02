/**
 * Prime Wave — Network Counter Reconciliation
 *
 * WHAT THIS SCRIPT DOES
 * ─────────────────────
 * Recomputes the three denormalized counters on the User model from the
 * authoritative relationship columns and patches any row whose stored value
 * differs from the derived truth.
 *
 * COUNTERS RECONCILED
 * ───────────────────
 *   directLeftCount     — COUNT of users where binaryParentId = user.id AND position = 'LEFT'
 *   directRightCount    — COUNT of users where binaryParentId = user.id AND position = 'RIGHT'
 *   directReferralCount — COUNT of users where sponsorId = user.id
 *
 * COUNTERS NOT TOUCHED
 * ─────────────────────
 *   leftBV / rightBV    — maintained live by propagateBV() inside createInvestment(); always correct.
 *   Wallet balances     — maintained live by deposit / investment / withdrawal services.
 *
 * SAFETY GUARANTEES
 * ─────────────────
 *   • Read-only audit phase runs first; no writes unless --fix flag is passed.
 *   • Each UPDATE statement is WHERE actual != stored — zero writes when values are already correct.
 *   • Idempotent: running twice produces identical results; second run reports 0 updates.
 *   • No truncation, no re-seeding; only targeted patches to incorrect rows.
 *   • Each phase is wrapped in try/catch so a single failure does not abort the rest.
 *
 * USAGE
 * ─────
 *   Audit only (dry-run, no writes):
 *     pnpm --filter @workspace/api-server run reconcile-counters
 *
 *   Audit + fix:
 *     pnpm --filter @workspace/api-server run reconcile-counters -- --fix
 *
 * REUSE GUIDANCE
 * ──────────────
 *   Safe to run after any network import, migration, manual tree surgery, or
 *   bulk seed operation. Re-run audit-only first to confirm scope, then --fix.
 */

import { prisma } from "../../config/prisma.js";

// ── CLI flags ─────────────────────────────────────────────────────────────────

const FIX_MODE = process.argv.includes("--fix");

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function section(title: string) {
  const bar = "═".repeat(57);
  log(bar);
  log(`  ${title}`);
  log(bar);
}

function rule() {
  log("  " + "─".repeat(55));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CounterRow {
  id:                   string;
  username:             string;
  directLeftCount:      number;
  directRightCount:     number;
  directReferralCount:  number;
  actualLeft:           number;
  actualRight:          number;
  actualReferral:       number;
}

interface AuditResult {
  total:          number;
  leftWrong:      number;
  rightWrong:     number;
  referralWrong:  number;
  rows:           CounterRow[];
}

// ── Phase 1: Audit ────────────────────────────────────────────────────────────

async function runAudit(): Promise<AuditResult> {
  // Single query: join actual counts (computed from relationships) onto stored values.
  // LEFT JOINs ensure users with 0 actual children appear with cnt = 0.
  const rows = await prisma.$queryRaw<Array<{
    id:                   string;
    username:             string;
    stored_left:          number;
    stored_right:         number;
    stored_referral:      number;
    actual_left:          bigint;
    actual_right:         bigint;
    actual_referral:      bigint;
  }>>`
    SELECT
      u.id,
      u.username,
      u."directLeftCount"      AS stored_left,
      u."directRightCount"     AS stored_right,
      u."directReferralCount"  AS stored_referral,
      COALESCE(lc.cnt, 0)      AS actual_left,
      COALESCE(rc.cnt, 0)      AS actual_right,
      COALESCE(rf.cnt, 0)      AS actual_referral
    FROM users u
    LEFT JOIN (
      SELECT "binaryParentId", COUNT(*) AS cnt
      FROM users
      WHERE position = 'LEFT' AND "binaryParentId" IS NOT NULL
      GROUP BY "binaryParentId"
    ) lc ON lc."binaryParentId" = u.id
    LEFT JOIN (
      SELECT "binaryParentId", COUNT(*) AS cnt
      FROM users
      WHERE position = 'RIGHT' AND "binaryParentId" IS NOT NULL
      GROUP BY "binaryParentId"
    ) rc ON rc."binaryParentId" = u.id
    LEFT JOIN (
      SELECT "sponsorId", COUNT(*) AS cnt
      FROM users
      WHERE "sponsorId" IS NOT NULL
      GROUP BY "sponsorId"
    ) rf ON rf."sponsorId" = u.id
    WHERE
      u."directLeftCount"     != COALESCE(lc.cnt, 0)
      OR u."directRightCount"  != COALESCE(rc.cnt, 0)
      OR u."directReferralCount" != COALESCE(rf.cnt, 0)
    ORDER BY u.username
  `;

  // BigInt → number (counts will never exceed safe int range)
  const parsed: CounterRow[] = rows.map(r => ({
    id:                  r.id,
    username:            r.username,
    directLeftCount:     r.stored_left,
    directRightCount:    r.stored_right,
    directReferralCount: r.stored_referral,
    actualLeft:          Number(r.actual_left),
    actualRight:         Number(r.actual_right),
    actualReferral:      Number(r.actual_referral),
  }));

  const total = await prisma.user.count();

  return {
    total,
    leftWrong:     parsed.filter(r => r.directLeftCount     !== r.actualLeft).length,
    rightWrong:    parsed.filter(r => r.directRightCount    !== r.actualRight).length,
    referralWrong: parsed.filter(r => r.directReferralCount !== r.actualReferral).length,
    rows:          parsed,
  };
}

// ── Phase 2: Fix ─────────────────────────────────────────────────────────────

async function fixLeft(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE users u
    SET "directLeftCount" = COALESCE(sub.cnt, 0)
    FROM (
      SELECT u2.id, COALESCE(lc.cnt, 0) AS cnt
      FROM users u2
      LEFT JOIN (
        SELECT "binaryParentId", COUNT(*) AS cnt
        FROM users
        WHERE position = 'LEFT' AND "binaryParentId" IS NOT NULL
        GROUP BY "binaryParentId"
      ) lc ON lc."binaryParentId" = u2.id
    ) sub
    WHERE u.id = sub.id
      AND u."directLeftCount" != sub.cnt
  `;
  return result;
}

async function fixRight(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE users u
    SET "directRightCount" = COALESCE(sub.cnt, 0)
    FROM (
      SELECT u2.id, COALESCE(rc.cnt, 0) AS cnt
      FROM users u2
      LEFT JOIN (
        SELECT "binaryParentId", COUNT(*) AS cnt
        FROM users
        WHERE position = 'RIGHT' AND "binaryParentId" IS NOT NULL
        GROUP BY "binaryParentId"
      ) rc ON rc."binaryParentId" = u2.id
    ) sub
    WHERE u.id = sub.id
      AND u."directRightCount" != sub.cnt
  `;
  return result;
}

async function fixReferral(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE users u
    SET "directReferralCount" = COALESCE(sub.cnt, 0)
    FROM (
      SELECT u2.id, COALESCE(rf.cnt, 0) AS cnt
      FROM users u2
      LEFT JOIN (
        SELECT "sponsorId", COUNT(*) AS cnt
        FROM users
        WHERE "sponsorId" IS NOT NULL
        GROUP BY "sponsorId"
      ) rf ON rf."sponsorId" = u2.id
    ) sub
    WHERE u.id = sub.id
      AND u."directReferralCount" != sub.cnt
  `;
  return result;
}

// ── Report helpers ────────────────────────────────────────────────────────────

function printAuditTable(audit: AuditResult) {
  const { rows } = audit;

  if (rows.length === 0) {
    log("  All counters are correct. No mismatches found.");
    return;
  }

  // Group mismatches by counter
  const leftBad     = rows.filter(r => r.directLeftCount     !== r.actualLeft);
  const rightBad    = rows.filter(r => r.directRightCount    !== r.actualRight);
  const referralBad = rows.filter(r => r.directReferralCount !== r.actualReferral);

  const printGroup = (
    label:   string,
    bad:     CounterRow[],
    stored:  (r: CounterRow) => number,
    actual:  (r: CounterRow) => number,
  ) => {
    if (bad.length === 0) {
      log(`  ${label.padEnd(24)}: ✓ all correct`);
      return;
    }

    // Summarise by (stored, actual) pair to keep output compact for large groups
    const pairs = new Map<string, { count: number; stored: number; actual: number }>();
    for (const r of bad) {
      const key = `${stored(r)}→${actual(r)}`;
      const existing = pairs.get(key);
      if (existing) existing.count++;
      else pairs.set(key, { count: 1, stored: stored(r), actual: actual(r) });
    }

    log(`  ${label.padEnd(24)}: ✗ ${bad.length} rows wrong`);
    for (const [, v] of pairs) {
      log(`    stored=${v.stored} → correct=${v.actual}  (×${v.count} users)`);
    }

    // Show up to 5 example usernames
    const examples = bad.slice(0, 5).map(r => r.username).join(", ");
    const more     = bad.length > 5 ? ` … +${bad.length - 5} more` : "";
    log(`    examples: ${examples}${more}`);
  };

  rule();
  log("  COUNTER MISMATCHES");
  rule();
  printGroup("directLeftCount",     leftBad,     r => r.directLeftCount,     r => r.actualLeft);
  printGroup("directRightCount",    rightBad,    r => r.directRightCount,    r => r.actualRight);
  printGroup("directReferralCount", referralBad, r => r.directReferralCount, r => r.actualReferral);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  section(`NETWORK COUNTER RECONCILIATION  [${FIX_MODE ? "FIX" : "AUDIT ONLY"}]`);
  log(`  Mode: ${FIX_MODE ? "--fix (writes enabled)" : "dry-run (pass --fix to apply changes)"}`);
  log("");

  // ── Phase 1: Audit ──────────────────────────────────────────────────────────
  log("  Running audit…");
  const before = await runAudit();

  log(`  Total users in DB : ${before.total}`);
  log(`  Mismatched rows   : ${before.rows.length}`);
  log("");

  printAuditTable(before);

  if (before.rows.length === 0) {
    log("");
    section("RESULT: CLEAN — no action needed");
    process.exit(0);
  }

  // ── Dry-run exit ────────────────────────────────────────────────────────────
  if (!FIX_MODE) {
    log("");
    rule();
    log("  DRY-RUN COMPLETE.");
    log("  Re-run with --fix to apply the corrections shown above.");
    rule();
    process.exit(0);
  }

  // ── Phase 2: Fix ────────────────────────────────────────────────────────────
  log("");
  section("APPLYING CORRECTIONS");

  let totalUpdated = 0;
  let fixErrors    = 0;

  const tasks: Array<{ label: string; fn: () => Promise<number> }> = [
    { label: "directLeftCount",     fn: fixLeft     },
    { label: "directRightCount",    fn: fixRight    },
    { label: "directReferralCount", fn: fixReferral },
  ];

  for (const { label, fn } of tasks) {
    try {
      const updated = await fn();
      log(`  ${label.padEnd(24)}: ${updated} rows updated`);
      totalUpdated += updated;
    } catch (err) {
      fixErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      log(`  ${label.padEnd(24)}: ✗ ERROR — ${msg}`);
    }
  }

  // ── Phase 3: Post-fix audit ─────────────────────────────────────────────────
  log("");
  section("POST-FIX VERIFICATION");

  const after = await runAudit();

  log(`  Total users in DB       : ${after.total}`);
  log(`  Mismatched rows before  : ${before.rows.length}`);
  log(`  Mismatched rows after   : ${after.rows.length}`);
  log(`  Rows corrected          : ${before.rows.length - after.rows.length}`);
  log(`  Total UPDATE statements : ${totalUpdated}`);

  if (after.rows.length > 0) {
    log("");
    log("  ⚠  Remaining mismatches (investigate manually):");
    printAuditTable(after);
  } else {
    log("");
    log("  ✓ All counters now match the authoritative relationship data.");
  }

  if (fixErrors > 0) {
    log(`  ✗ ${fixErrors} counter(s) failed to update — see errors above.`);
  }

  log("");
  section("DONE");

  process.exit(fixErrors > 0 || after.rows.length > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
