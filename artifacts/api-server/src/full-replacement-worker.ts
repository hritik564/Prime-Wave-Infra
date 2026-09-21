type FullReplacementWorkerMessage = {
  runId: string;
  adminId: string;
  password: string;
};

function isWorkerMessage(value: unknown): value is FullReplacementWorkerMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message["runId"] === "string"
    && typeof message["adminId"] === "string"
    && typeof message["password"] === "string"
  );
}

let handled = false;

process.on("message", (value: unknown) => {
  if (handled) return;
  handled = true;

  void (async () => {
    if (!isWorkerMessage(value)) {
      process.exitCode = 1;
      return;
    }

    const [{ prisma }, { runDedicatedFullReplacementWorker }] = await Promise.all([
      import("./config/prisma"),
      import("./admin/common-password-reset.service"),
    ]);

    try {
      await runDedicatedFullReplacementWorker(
        value.runId,
        value.adminId,
        value.password,
      );
      process.exitCode = 0;
    } finally {
      await prisma.$disconnect();
      process.disconnect?.();
    }
  })().catch((error: unknown) => {
    // Do not include the error object because an unexpected message could
    // contain sensitive connection or credential details.
    process.stderr.write(
      `[FULL_REPLACEMENT_WORKER] ${error instanceof Error ? error.name : "WorkerError"}\n`,
    );
    process.exitCode = 1;
    process.disconnect?.();
  });
});