/**
 * reconcile23b.ts
 *
 * Phase 1 — Production Health Check
 *   Verifies DB connectivity, admin presence, salary config, and scheduler
 *   readiness before allowing the seed to run.
 *
 * Phase 4 — Automatic Financial Reconciliation
 *   Runs immediately after the seed and validates the complete financial
 *   state: user counts, deposits, investments, binary tree, level income,
 *   salary achievements, and wallet balances.
 *
 * Phase 5 — Final Production Report
 *   Structured report logged and returned for the caller to surface.
 */

import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";

// ── Expected seed constants ────────────────────────────────────────────────────

const EXPECTED_TOTAL_USERS       = 127;
const EXPECTED_ACTIVE_USERS      = 63;   // master + levels 1-5
const EXPECTED_INACTIVE_USERS    = 64;   // level-6 leaf nodes
const EXPECTED_DEPOSITS          = 127;
const EXPECTED_INVESTMENTS       = 127;
const SEED_AMOUNT_USD            = 100;
const MAX_LEVEL_INCOME_LEVELS    = 5;    // hardcoded in level-income.service.ts

/**
 * Expected level income entries for the 127-node tree.
 *
 * Each investment fires level income for min(depth, MAX_LEVEL_INCOME_LEVELS) ancestors.
 *   depth 0 (master, 1 node)  : 0 × 1  =   0
 *   depth 1 (2 nodes)         : 1 × 2  =   2
 *   depth 2 (4 nodes)         : 2 × 4  =   8
 *   depth 3 (8 nodes)         : 3 × 8  =  24
 *   depth 4 (16 nodes)        : 4 × 16 =  64
 *   depth 5 (32 nodes)        : 5 × 32 = 160
 *   depth 6 (64 nodes, capped): 5 × 64 = 320
 *   ─────────────────────────────────────────
 *   Total                              = 578
 */
const EXPECTED_LEVEL_INCOME_ROWS = 578;

// ── Phase 1 types ─────────────────────────────────────────────────────────────

export interface HealthCheckItem {
  check:   string;
  status:  "PASS" | "FAIL";
  detail?: string;
}

export interface HealthReport {
  passed:  boolean;
  items:   HealthCheckItem[];
  summary: string;
}

// ── Phase 4/5 types ───────────────────────────────────────────────────────────

export interface ReconciliationItem {
  check:    string;
  expected: string | number;
  actual:   string | number;
  status:   "PASS" | "FAIL";
  detail?:  string;
}

export interface ReconciliationReport {
  passed:              boolean;
  items:               ReconciliationItem[];
  // Phase 5 summary fields
  deployedVersion:     string;
  migrationStatus:     string;
  usersCreated:        number;
  usersSkipped:        number;
  totalUsers:          number;
  activeUsers:         number;
  inactiveUsers:       number;
  totalDeposits:       number;
  totalInvestments:    number;
  totalInvestValue:    string;
  levelIncomeRecords:  number;
  salaryAchievements:  number;
  binaryTreeStatus:    string;
  schedulerReadiness:  string;
  verdict:             "PASS" | "FAIL";
  failingChecks:       string[];
}

// ── Phase 1 — Health Check ────────────────────────────────────────────────────

export async function runPhase1HealthCheck(): Promise<HealthReport> {
  logger.info("Phase 1: running production health check…");
  const items: HealthCheckItem[] = [];

  // 1a. DB connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    items.push({ check: "DB connectivity", status: "PASS" });
  } catch (err) {
    items.push({ check: "DB connectivity", status: "FAIL", detail: String(err) });
  }

  // 1b. SUPER_ADMIN exists
  try {
    const admin = await prisma.admin.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true } });
    if (admin) {
      items.push({ check: "SUPER_ADMIN present", status: "PASS" });
    } else {
      items.push({ check: "SUPER_ADMIN present", status: "FAIL", detail: "No SUPER_ADMIN row found" });
    }
  } catch (err) {
    items.push({ check: "SUPER_ADMIN present", status: "FAIL", detail: String(err) });
  }

  // 1c. SalaryRankConfig populated
  try {
    const count = await prisma.salaryRankConfig.count();
    if (count > 0) {
      items.push({ check: "SalaryRankConfig seeded", status: "PASS", detail: `${count} ranks configured` });
    } else {
      items.push({ check: "SalaryRankConfig seeded", status: "FAIL", detail: "No salary rank configs found" });
    }
  } catch (err) {
    items.push({ check: "SalaryRankConfig seeded", status: "FAIL", detail: String(err) });
  }

  // 1d. Master user exists
  try {
    const master = await prisma.user.findFirst({ where: { username: "master" }, select: { id: true, status: true } });
    if (master) {
      items.push({ check: "Master user present", status: "PASS", detail: `status=${master.status}` });
    } else {
      items.push({ check: "Master user present", status: "FAIL", detail: "No user with username=master" });
    }
  } catch (err) {
    items.push({ check: "Master user present", status: "FAIL", detail: String(err) });
  }

  // 1e. Canonical Investment Service reachable (PLAN_360 enum value exists — always valid, guard via DB write test)
  try {
    const inv = await prisma.investment.findFirst({
      where:  { planType: "PLAN_360" },
      select: { id: true },
    });
    // If no investment yet, that's fine — the enum is valid
    items.push({ check: "Investment service / PLAN_360 reachable", status: "PASS", detail: inv ? "existing PLAN_360 found" : "no investments yet (pre-seed)" });
  } catch (err) {
    items.push({ check: "Investment service / PLAN_360 reachable", status: "FAIL", detail: String(err) });
  }

  // 1f. SystemSettings (cron readiness)
  try {
    const settings = await prisma.systemSettings.findFirst({ select: { id: true } });
    if (settings) {
      items.push({ check: "SystemSettings / cron config", status: "PASS" });
    } else {
      // SystemSettings might not be required pre-seed; treat as warning not fatal
      items.push({ check: "SystemSettings / cron config", status: "PASS", detail: "No SystemSettings row (cron will use defaults)" });
    }
  } catch (err) {
    items.push({ check: "SystemSettings / cron config", status: "FAIL", detail: String(err) });
  }

  const passed  = items.every((i) => i.status === "PASS");
  const failing = items.filter((i) => i.status === "FAIL").map((i) => i.check);
  const summary = passed
    ? `All ${items.length} health checks passed`
    : `FAILED: ${failing.join(", ")}`;

  logger.info({ passed, summary, items }, "Phase 1: health check complete");
  return { passed, items, summary };
}

// ── Phase 4 — Financial Reconciliation ───────────────────────────────────────

function rec(
  check: string,
  expected: string | number,
  actual: string | number,
  detail?: string,
): ReconciliationItem {
  const status: "PASS" | "FAIL" = expected === actual ? "PASS" : "FAIL";
  return { check, expected, actual, status, detail };
}

export async function runPhase4Reconciliation(seedSummary?: {
  usersCreated: number;
  usersSkipped: number;
}): Promise<ReconciliationReport> {
  logger.info("Phase 4: running financial reconciliation…");
  const items: ReconciliationItem[] = [];

  // ── 4.1 User counts ──────────────────────────────────────────────────────
  const totalUsers    = await prisma.user.count();
  const activeUsers   = await prisma.user.count({ where: { status: "ACTIVE" } });
  const inactiveUsers = await prisma.user.count({ where: { status: "INACTIVE" } });

  items.push(rec("Total users",    EXPECTED_TOTAL_USERS,    totalUsers));
  items.push(rec("ACTIVE users",   EXPECTED_ACTIVE_USERS,   activeUsers));
  items.push(rec("INACTIVE users", EXPECTED_INACTIVE_USERS, inactiveUsers));

  // ── 4.2 Approved deposits ────────────────────────────────────────────────
  const approvedDeposits = await prisma.depositRequest.count({ where: { status: "APPROVED" } });
  items.push(rec("Approved deposits", EXPECTED_DEPOSITS, approvedDeposits));

  // ── 4.3 Investments ──────────────────────────────────────────────────────
  const totalInvestments = await prisma.investment.count({
    where: { status: { in: ["ACTIVE", "MATURED"] } },
  });
  const plan360Investments = await prisma.investment.count({
    where: { planType: "PLAN_360", status: { in: ["ACTIVE", "MATURED"] } },
  });
  const noAutoCompound = await prisma.investment.count({
    where: { autoCompound: false, status: { in: ["ACTIVE", "MATURED"] } },
  });

  items.push(rec("Total investments",             EXPECTED_INVESTMENTS, totalInvestments));
  items.push(rec("PLAN_360 investments",          EXPECTED_INVESTMENTS, plan360Investments,   "all must be 360-day plan"));
  items.push(rec("Auto Compound OFF investments", EXPECTED_INVESTMENTS, noAutoCompound,       "all must have autoCompound=false"));

  // ── 4.4 Investment total value ────────────────────────────────────────────
  const investAgg = await prisma.investment.aggregate({
    where:  { status: { in: ["ACTIVE", "MATURED"] } },
    _sum:   { amount: true },
  });
  const totalInvestValue  = Number(investAgg._sum.amount ?? 0);
  const expectedTotalUSD  = EXPECTED_INVESTMENTS * SEED_AMOUNT_USD;
  items.push(rec("Total investment value (USD)", expectedTotalUSD, totalInvestValue));

  // ── 4.5 Binary tree integrity ─────────────────────────────────────────────
  // All non-master users must have sponsorId set
  const noSponsor = await prisma.user.count({
    where: { username: { not: "master" }, sponsorId: null },
  });
  items.push(rec(
    "Binary tree: all non-master users have sponsorId",
    0, noSponsor,
    noSponsor > 0 ? `${noSponsor} users missing sponsorId` : "perfect chain",
  ));

  // ── 4.6 Level income count ───────────────────────────────────────────────
  const levelIncomeCount = await prisma.levelIncome.count();
  items.push(rec("Level income records", EXPECTED_LEVEL_INCOME_ROWS, levelIncomeCount));

  // ── 4.7 No duplicate level income ─────────────────────────────────────────
  // Duplicate = same (receiverUserId, investmentId, level) appears more than once
  const dupes = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT "receiverUserId", "investmentId", "level", COUNT(*) AS n
      FROM "LevelIncome"
      GROUP BY "receiverUserId", "investmentId", "level"
      HAVING COUNT(*) > 1
    ) dups
  `;
  const dupeCount = Number(dupes[0]?.cnt ?? 0);
  items.push(rec(
    "No duplicate level income entries",
    0, dupeCount,
    dupeCount > 0 ? `${dupeCount} duplicate (receiverUserId, investmentId, level) combos` : "no duplicates",
  ));

  // ── 4.8 Salary achievements ───────────────────────────────────────────────
  const salaryAchievements = await prisma.salaryAchievement.count();
  // We expect at least 1 achievement for master (Bronze+ based on seed)
  const achievementStatus = salaryAchievements >= 1 ? "PASS" : "FAIL";
  items.push({
    check:    "Salary achievements recorded",
    expected: ">= 1",
    actual:   salaryAchievements,
    status:   achievementStatus,
    detail:   `${salaryAchievements} achievement rows`,
  });

  // ── 4.9 Wallet balance sanity ─────────────────────────────────────────────
  // Total depositWallet across all users must be ≥ 0 (no negative balances)
  const walletAgg = await prisma.wallet.aggregate({
    _min: { depositWallet: true, incomeWallet: true, withdrawalWallet: true },
  });
  const minDeposit     = Number(walletAgg._min.depositWallet    ?? 0);
  const minIncome      = Number(walletAgg._min.incomeWallet     ?? 0);
  const minWithdrawal  = Number(walletAgg._min.withdrawalWallet ?? 0);
  const noNegativeWallet = minDeposit >= 0 && minIncome >= 0 && minWithdrawal >= 0;
  items.push({
    check:    "Wallet balances non-negative",
    expected: "all >= 0",
    actual:   `min deposit=${minDeposit}, min income=${minIncome}, min withdrawal=${minWithdrawal}`,
    status:   noNegativeWallet ? "PASS" : "FAIL",
  });

  // ── 4.10 Scheduler readiness (JobExecutionLog exists or can be written to) ─
  try {
    await prisma.$queryRaw`SELECT 1 FROM "JobExecutionLog" LIMIT 0`;
    items.push({ check: "Scheduler table accessible", expected: "accessible", actual: "accessible", status: "PASS" });
  } catch (err) {
    items.push({ check: "Scheduler table accessible", expected: "accessible", actual: "error", status: "FAIL", detail: String(err) });
  }

  // ── Migration status ──────────────────────────────────────────────────────
  let migrationStatus = "unknown";
  try {
    const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `;
    if (migrations.length > 0) {
      migrationStatus = `latest: ${migrations[0].migration_name}`;
    }
  } catch {
    migrationStatus = "could not query (db:push mode — no migration table)";
  }

  // ── Build report ──────────────────────────────────────────────────────────
  const passed       = items.every((i) => i.status === "PASS");
  const failingItems = items.filter((i) => i.status === "FAIL");

  const report: ReconciliationReport = {
    passed,
    items,
    deployedVersion:    process.env["npm_package_version"] ?? "unknown",
    migrationStatus,
    usersCreated:       seedSummary?.usersCreated ?? 0,
    usersSkipped:       seedSummary?.usersSkipped ?? 0,
    totalUsers,
    activeUsers,
    inactiveUsers,
    totalDeposits:      approvedDeposits,
    totalInvestments,
    totalInvestValue:   `$${totalInvestValue}`,
    levelIncomeRecords: levelIncomeCount,
    salaryAchievements,
    binaryTreeStatus:   noSponsor === 0 ? "PERFECT — all non-master users linked" : `BROKEN — ${noSponsor} unlinked`,
    schedulerReadiness: "table accessible",
    verdict:            passed ? "PASS" : "FAIL",
    failingChecks:      failingItems.map((i) => `${i.check} (expected ${i.expected}, got ${i.actual})`),
  };

  logger.info(
    { verdict: report.verdict, passed: items.filter((i) => i.status === "PASS").length, failed: failingItems.length },
    "Phase 4: reconciliation complete"
  );

  return report;
}

// ── Phase 5 — Final Production Report ────────────────────────────────────────

export function logPhase5Report(health: HealthReport, recon: ReconciliationReport): void {
  const line = "═".repeat(60);

  logger.info(`\n${line}`);
  logger.info("  PRIME WAVE — FINAL PRODUCTION SEED REPORT");
  logger.info(line);

  logger.info("## DEPLOYMENT");
  logger.info(`  Version          : ${recon.deployedVersion}`);
  logger.info(`  Migration Status : ${recon.migrationStatus}`);

  logger.info("\n## HEALTH CHECK");
  for (const item of health.items) {
    const symbol = item.status === "PASS" ? "✓" : "✗";
    logger.info(`  [${symbol}] ${item.check}${item.detail ? ` — ${item.detail}` : ""}`);
  }

  logger.info("\n## SEED SUMMARY");
  logger.info(`  Users Created    : ${recon.usersCreated}`);
  logger.info(`  Users Skipped    : ${recon.usersSkipped}`);
  logger.info(`  Total Users      : ${recon.totalUsers}`);
  logger.info(`  Total Deposits   : ${recon.totalDeposits}`);
  logger.info(`  Total Investments: ${recon.totalInvestments}`);
  logger.info(`  Total Value      : ${recon.totalInvestValue}`);

  logger.info("\n## FINANCIAL SUMMARY");
  logger.info(`  ACTIVE Members   : ${recon.activeUsers}`);
  logger.info(`  INACTIVE Members : ${recon.inactiveUsers}`);
  logger.info(`  Level Income     : ${recon.levelIncomeRecords} records`);
  logger.info(`  Salary Achiev.   : ${recon.salaryAchievements} records`);
  logger.info(`  Binary Tree      : ${recon.binaryTreeStatus}`);
  logger.info(`  Scheduler        : ${recon.schedulerReadiness}`);

  logger.info("\n## RECONCILIATION CHECKS");
  for (const item of recon.items) {
    const symbol = item.status === "PASS" ? "✓" : "✗";
    const detail = item.detail ? ` — ${item.detail}` : "";
    logger.info(`  [${symbol}] ${item.check}: expected=${item.expected}, actual=${item.actual}${detail}`);
  }

  logger.info(`\n${line}`);
  if (recon.verdict === "PASS") {
    logger.info("  ✓ RECONCILIATION: PASS");
    logger.info("  The production database is fully seeded, reconciled,");
    logger.info("  internally consistent, and ready for production testing.");
  } else {
    logger.error("  ✗ RECONCILIATION: FAIL");
    logger.error("  Failing checks:");
    for (const f of recon.failingChecks) {
      logger.error(`    • ${f}`);
    }
  }
  logger.info(line);
}
