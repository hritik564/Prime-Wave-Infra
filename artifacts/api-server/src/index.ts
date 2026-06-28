import bcrypt from "bcryptjs";
import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./cron";
import { prisma } from "./config/prisma";
import { maybeResetForLaunch } from "./admin/scripts/resetForLaunch";
import { runSeed23B } from "./dev/seed23b.fn";

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
// Calls runSeed23B() directly in-process — no HTTP, no timeouts, per-user retry.
// Remove the env var after seeding is confirmed complete.
async function maybeSeedOnStart() {
  if (!process.env["SEED_ON_START"]) return;

  try {
    const userCount = await prisma.user.count();
    if (userCount >= 127) {
      logger.info({ userCount }, "SEED_ON_START: skipped — seed already complete");
      return;
    }

    logger.info({ userCount }, "SEED_ON_START: starting in-process seed (no HTTP)…");
    const summary = await runSeed23B();
    logger.info({ summary }, "SEED_ON_START: seed completed successfully");
  } catch (err) {
    logger.error({ err }, "SEED_ON_START: seed failed");
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
});
