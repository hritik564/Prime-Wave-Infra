import bcrypt from "bcryptjs";
import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./cron";
import { startDepositVerificationWorker } from "./deposit-verification/deposit-verification.worker";
import { prisma } from "./config/prisma";
import { maybeResetForLaunch } from "./admin/scripts/resetForLaunch";
import { runSeed23B }                                      from "./dev/seed23b.fn";
import { runPhase1HealthCheck, runPhase4Reconciliation, logPhase5Report } from "./dev/reconcile23b";

// One-time admin password reset — runs only when ADMIN_RESET_PASSWORD is set.
// Remove the env var after the first successful deploy to disable this.
async function maybeResetAdminPassword() {
  const newPassword = process.env["ADMIN_RESET_PASSWORD"];
  if (!newPassword) return;
  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const updated = await prisma.admin.updateMany({
      where: { email: "admin@primewave.io" },
      data: { passwordHash: hash },
    });
    logger.info({ count: updated.count }, "Admin password reset via ADMIN_RESET_PASSWORD env var");
  } catch (err) {
    logger.error({ err }, "Failed to reset admin password");
  }
}

// One-time startup seed — runs only when SEED_ON_START=1 is set and the
// binary tree is not yet fully built (< 127 users).
//
// Phases:
//   Phase 1 — Health check (DB, admin, salary config, etc.)  STOP if any fail.
//   Phase 2 — In-process seed via runSeed23B()  (resumable, never deletes).
//   Phase 3 — Per-user retry built into runSeed23B().
//   Phase 4 — Automatic financial reconciliation.
//   Phase 5 — Final production report logged.
//
// Remove SEED_ON_START env var after seeding is confirmed complete.
async function maybeSeedOnStart() {
  if (!process.env["SEED_ON_START"]) return;

  try {
    // ── Phase 1: Health check ───────────────────────────────────────────────
    const health = await runPhase1HealthCheck();
    if (!health.passed) {
      logger.error({ summary: health.summary }, "SEED_ON_START: Phase 1 FAILED — aborting seed");
      return;
    }
    logger.info({ summary: health.summary }, "SEED_ON_START: Phase 1 passed");

    // ── Guard: already seeded? ──────────────────────────────────────────────
    const userCount = await prisma.user.count();
    if (userCount >= 127) {
      logger.info({ userCount }, "SEED_ON_START: skipped — seed already complete; running reconciliation only");
      const recon = await runPhase4Reconciliation();
      logPhase5Report(health, recon);
      return;
    }

    // ── Phase 2 + 3: Seed (resumable, per-user retry) ───────────────────────
    logger.info({ userCount }, "SEED_ON_START: Phase 2 — starting in-process seed…");
    const seedSummary = await runSeed23B();
    logger.info({ seedSummary }, "SEED_ON_START: Phase 2 complete");

    // ── Phase 4: Financial reconciliation ───────────────────────────────────
    logger.info("SEED_ON_START: Phase 4 — running financial reconciliation…");
    const recon = await runPhase4Reconciliation({
      usersCreated: seedSummary.usersCreated,
      usersSkipped: seedSummary.usersSkipped,
    });

    // ── Phase 5: Final production report ────────────────────────────────────
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

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // One-time admin password reset (disabled when env var is absent)
  maybeResetAdminPassword().catch((e) => logger.error({ e }, "maybeResetAdminPassword failed"));

  // Pre-launch DB reset — runs only when RESET_FOR_LAUNCH=true; remove env var after first deploy
  maybeResetForLaunch().catch((e) => logger.error({ e }, "maybeResetForLaunch failed"));

  // One-time startup seed — runs only when SEED_ON_START=1; remove env var after seeding
  maybeSeedOnStart().catch((e) => logger.error({ e }, "maybeSeedOnStart failed"));

  // Start 12-hour ROI cycle scheduler (fires at 00:00 and 12:00 UTC)
  startScheduler();

  // Start deposit verification polling worker (DB-driven, restart-safe)
  startDepositVerificationWorker().catch((e) =>
    logger.error({ e }, "startDepositVerificationWorker failed"),
  );
});
