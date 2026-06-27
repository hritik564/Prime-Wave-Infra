import bcrypt from "bcryptjs";
import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./cron";
import { prisma } from "./config/prisma";

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

  // Start 12-hour ROI cycle scheduler (fires at 00:00 and 12:00 UTC)
  startScheduler();
});
