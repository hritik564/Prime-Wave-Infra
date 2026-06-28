import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./cron";
import { prisma } from "./config/prisma";
import { maybeResetForLaunch } from "./admin/scripts/resetForLaunch";

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

// One-time startup seed — runs only when SEED_ON_START=1 is set and the DB
// has no investments yet (idempotent guard).  Remove the env var after the
// first successful deploy to keep startup fast.
async function maybeSeedOnStart(port: number) {
  if (!process.env["SEED_ON_START"]) return;

  try {
    const count = await prisma.investment.count();
    if (count > 0) {
      logger.info({ count }, "SEED_ON_START: skipped — investments already exist");
      return;
    }

    const jwtSecret = process.env["JWT_SECRET"];
    if (!jwtSecret) {
      logger.error("SEED_ON_START: JWT_SECRET not set, cannot generate seed token");
      return;
    }

    const admin = await prisma.admin.findFirst({
      where:  { role: "SUPER_ADMIN" },
      select: { id: true, email: true },
    });
    if (!admin) {
      logger.error("SEED_ON_START: No SUPER_ADMIN found");
      return;
    }

    const token = jwt.sign(
      { sub: admin.id, email: admin.email, type: "admin", role: "SUPER_ADMIN" },
      jwtSecret,
      { expiresIn: "10m" },
    );

    logger.info("SEED_ON_START: triggering 23B seed…");

    const resp = await fetch(`http://localhost:${port}/api/dev/seed/23b`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
    });

    const body = await resp.json() as unknown;
    if (resp.ok) {
      logger.info({ status: resp.status, body }, "SEED_ON_START: seed completed");
    } else {
      logger.error({ status: resp.status, body }, "SEED_ON_START: seed request failed");
    }
  } catch (err) {
    logger.error({ err }, "SEED_ON_START: unexpected error");
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
  maybeSeedOnStart(port).catch((e) => logger.error({ e }, "maybeSeedOnStart failed"));

  // Start 12-hour ROI cycle scheduler (fires at 00:00 and 12:00 UTC)
  startScheduler();
});
