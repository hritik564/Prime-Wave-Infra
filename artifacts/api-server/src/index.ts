import fs from "fs";
import bcrypt from "bcryptjs";
import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./cron";
import { startDepositVerificationWorker } from "./deposit-verification/deposit-verification.worker";
import { startWithdrawalAutoWorker } from "./withdrawals/withdrawal-auto-worker.service";
import { startWithdrawalRecovery } from "./withdrawals/withdrawal-recovery.service";
import { validateCompanyWallets } from "./company-wallet-validator";
import { prisma } from "./config/prisma";
import { maybeResetForLaunch } from "./admin/scripts/resetForLaunch";
import { runGenerator } from "./admin/scripts/networkGenerator";
import { runFunder }    from "./admin/scripts/networkFunder";
import { runSeed23B }                                      from "./dev/seed23b.fn";
import { runPhase1HealthCheck, runPhase4Reconciliation, logPhase5Report } from "./dev/reconcile23b";
import { loadLevelRules } from "./levelIncome/level-income.service";

// ── Synchronous boot logger ───────────────────────────────────────────────────
// Uses fs.writeSync so the write is a direct OS syscall — survives pipe
// buffering and process.exit() without flushing stdio streams.
function boot(stage: string, msg: string): void {
  const line = `[BOOT ${stage}] ${new Date().toISOString()} ${msg}\n`;
  try { fs.writeSync(1, line); } catch { /* stdout closed */ }
  try { fs.writeSync(2, line); } catch { /* stderr closed */ }
}

// ── Process-level exception handlers ─────────────────────────────────────────
// NOTE: static ESM imports are hoisted and evaluated *before* any module body
// code runs, so these handlers cannot intercept module-evaluation crashes (e.g.
// env.ts calling process.exit during import).  They DO catch every async
// exception and unhandled rejection that occurs after the module body starts.
process.on("uncaughtException", (err: unknown) => {
  const stack = err instanceof Error ? err.stack : String(err);
  boot("FATAL-uncaughtException", stack ?? "(no stack)");
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.stack : String(reason);
  boot("FATAL-unhandledRejection", msg ?? "(no reason)");
  process.exit(1);
});

boot("1", "Module body started — all static imports have been evaluated");

// ── One-time admin password reset ─────────────────────────────────────────────
async function maybeResetAdminPassword() {
  const newPassword = process.env["ADMIN_RESET_PASSWORD"];
  if (!newPassword) return;
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const updated = await prisma.admin.updateMany({
      data: { passwordHash: hash },
    });
    logger.info({ count: updated.count }, "All admin passwords reset via ADMIN_RESET_PASSWORD env var");
  } catch (err) {
    logger.error({ err }, "Failed to reset admin passwords");
  }
}

// ── One-time network generation + funding (Sprint 28C / 28F) ─────────────────
// Non-blocking: server starts and passes health checks while generation runs.
// Set GENERATE_NETWORK=true to run the generator on startup.
// Set FUND_NETWORK=true alongside GENERATE_NETWORK to auto-fund after generation.
// Remove both env vars after confirming completion via deployment logs.
function maybeGenerateNetwork(): void {
  if (!process.env["GENERATE_NETWORK"]) return;
  logger.info("GENERATE_NETWORK detected — starting network generator in background (Sprint 28F)");
  runGenerator()
    .then(() => {
      logger.info("GENERATE_NETWORK: network generation complete");
      if (!process.env["FUND_NETWORK"]) return;
      logger.info("FUND_NETWORK detected — starting network funder (Sprint 28F)");
      return runFunder().then(() =>
        logger.info("FUND_NETWORK: funding complete — remove GENERATE_NETWORK and FUND_NETWORK env vars"),
      );
    })
    .catch((err: unknown) => logger.error({ err }, "GENERATE_NETWORK/FUND_NETWORK: FAILED"))
    .finally(() => prisma.$disconnect());
}

// ── One-time startup seed ─────────────────────────────────────────────────────
async function maybeSeedOnStart() {
  if (!process.env["SEED_ON_START"]) return;

  try {
    const health = await runPhase1HealthCheck();
    if (!health.passed) {
      logger.error({ summary: health.summary }, "SEED_ON_START: Phase 1 FAILED — aborting seed");
      return;
    }
    logger.info({ summary: health.summary }, "SEED_ON_START: Phase 1 passed");

    const userCount = await prisma.user.count();
    if (userCount >= 127) {
      logger.info({ userCount }, "SEED_ON_START: skipped — seed already complete; running reconciliation only");
      const recon = await runPhase4Reconciliation();
      logPhase5Report(health, recon);
      return;
    }

    logger.info({ userCount }, "SEED_ON_START: Phase 2 — starting in-process seed…");
    const seedSummary = await runSeed23B();
    logger.info({ seedSummary }, "SEED_ON_START: Phase 2 complete");

    logger.info("SEED_ON_START: Phase 4 — running financial reconciliation…");
    const recon = await runPhase4Reconciliation({
      usersCreated: seedSummary.usersCreated,
      usersSkipped: seedSummary.usersSkipped,
    });

    logPhase5Report(health, recon);

    if (!recon.passed) {
      logger.error(
        { failingChecks: recon.failingChecks },
        "SEED_ON_START: Phase 4 FAILED — reconciliation did not pass; manual inspection required"
      );
    }
  } catch (err) {
    logger.error({ err }, "SEED_ON_START: unhandled error in seed pipeline");
  }
}

// ── PORT validation ───────────────────────────────────────────────────────────
boot("2", `PORT=${process.env["PORT"] ?? "(not set)"} NODE_ENV=${process.env["NODE_ENV"] ?? "(not set)"}`);

const rawPort = process.env["PORT"];

if (!rawPort) {
  boot("FATAL-no-PORT", "PORT environment variable is required but was not provided — calling process.exit(1)");
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  boot("FATAL-bad-PORT", `Invalid PORT value: "${rawPort}" — calling process.exit(1)`);
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

boot("3", `PORT validated: ${port} — calling app.listen()`);

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = app.listen(port, () => {
  boot("5", `app.listen() callback fired — port ${port} is bound`);

  logger.info({ port }, "Server listening");

  // ── Level Income Configuration Startup Validation ─────────────────────────
  loadLevelRules()
    .then((rules) => {
      const rates = Object.entries(rules)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([l, r]) => `L${l} → ${r}%`)
        .join(", ");
      logger.info(
        { levels: Object.keys(rules).length, rates: Object.fromEntries(Object.entries(rules).map(([l, r]) => [`L${l}`, `${r}%`])) },
        `Level Income Configuration Loaded | Levels: ${Object.keys(rules).length} | Rates: ${rates}`,
      );
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      boot("FATAL-level-config", `Level Income config validation failed — ${msg}`);
      logger.error({ err }, "FATAL: Level Income config is invalid — fix system_settings.level.config and restart");
      process.exit(1);
    });

  maybeResetAdminPassword().catch((e) => logger.error({ e }, "maybeResetAdminPassword failed"));
  maybeGenerateNetwork();
  maybeResetForLaunch().catch((e) => {
    boot("FATAL-reset-for-launch", `maybeResetForLaunch failed — calling process.exit(1): ${e instanceof Error ? e.stack : String(e)}`);
    logger.error({ e }, "FATAL: maybeResetForLaunch failed — server is exiting to prevent a partially-reset database from serving traffic");
    process.exit(1);
  });
  maybeSeedOnStart().catch((e) => logger.error({ e }, "maybeSeedOnStart failed"));

  startWithdrawalRecovery().catch((e) =>
    logger.error({ e }, "startWithdrawalRecovery failed"),
  );

  startScheduler();

  void import("./ledger/integrity-scan.service").then(({ startIntegrityScanScheduler }) => {
    startIntegrityScanScheduler();
  });

  boot("6", "validateCompanyWallets() starting");

  validateCompanyWallets()
    .then(({ results }) => {
      for (const r of results) {
        if (r.kind === "inactive") {
          logger.info({ network: r.network }, "Startup: company wallet skipped (inactive)");
        } else if (r.passed) {
          logger.info({ network: r.network, address: r.address }, "Startup: company wallet valid ✓");
        } else {
          logger.warn({ network: r.network, issue: r.issue, address: r.address }, "Startup: company wallet INVALID ✗");
        }
      }

      const bep20 = results.find((r) => r.network === "BEP20");
      const bep20ActiveFailed = bep20?.kind === "active" && !bep20.passed;

      boot("7", `validateCompanyWallets() complete — BEP20 kind=${bep20?.kind ?? "none"} passed=${String(bep20?.passed)} issue=${bep20?.issue ?? "none"}`);

      if (!bep20ActiveFailed) {
        logger.info("Startup: BEP20 wallet valid — deposit submissions enabled");
      } else {
        logger.error(
          { issue: bep20?.issue, address: bep20?.address },
          "Startup: BEP20 wallet is INVALID — deposit submissions will be rejected with 503",
        );
        if (process.env["NODE_ENV"] === "production") {
          boot("FATAL-bep20-invalid", `BEP20 wallet invalid in production — address=${bep20?.address ?? "none"} issue=${bep20?.issue ?? "none"} — calling process.exit(1)`);
          logger.error("FATAL: BEP20 company wallet is invalid in production — exiting to prevent wrong-address deposits");
          process.exit(1);
        }
      }

      const activeFailed = results.filter((r) => r.kind === "active" && !r.passed && r.network !== "BEP20");
      if (activeFailed.length > 0) {
        logger.warn(
          { networks: activeFailed.map((r) => r.network) },
          "Startup: active networks failed wallet validation — configure valid addresses before enabling those networks",
        );
      }
    })
    .catch((err) => {
      boot("ERROR-validateCompanyWallets", `validateCompanyWallets threw: ${err instanceof Error ? err.stack : String(err)}`);
      logger.error({ err }, "Startup: company wallet validation threw unexpected error");
    });

  startDepositVerificationWorker().catch((e) =>
    logger.error({ e }, "startDepositVerificationWorker failed"),
  );

  startWithdrawalAutoWorker().catch((e) =>
    logger.error({ e }, "startWithdrawalAutoWorker failed"),
  );
});

boot("4", `app.listen() called — waiting for OS to bind port ${port}`);

// ── Server-level error handler ────────────────────────────────────────────────
// app.listen() only fires the callback on SUCCESS.  Bind failures (EADDRINUSE,
// EACCES, ENOTFOUND, etc.) emit an 'error' event on the returned net.Server.
// Without a handler this becomes an uncaught exception written to stderr only —
// invisible in the current deployment log stream.
server.on("error", (err: NodeJS.ErrnoException) => {
  boot(
    "FATAL-server-error",
    `server 'error' event — code=${err.code ?? "none"} syscall=${err.syscall ?? "none"} port=${String((err as { port?: number }).port ?? port)} message=${err.message} stack=${err.stack ?? "(no stack)"}`,
  );
  logger.error({ err }, "FATAL: HTTP server failed to bind");
  process.exit(1);
});
