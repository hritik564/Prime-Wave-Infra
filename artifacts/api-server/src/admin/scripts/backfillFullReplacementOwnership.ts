import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prisma } from "../../config/prisma";
import {
  AUTHORITATIVE_MEMBERSHIP_SOURCE,
  HISTORICAL_FULL_REPLACEMENT_RUN_ID,
  backfillHistoricalFullReplacementMarkers,
} from "../full-replacement-marker-backfill";

type Manifest = {
  runId?: unknown;
  membershipSource?: unknown;
  userIds?: unknown;
};

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const manifestPath = resolve(requiredArgument("--manifest"));
  const confirmedRunId = requiredArgument("--confirm-run");
  if (confirmedRunId !== HISTORICAL_FULL_REPLACEMENT_RUN_ID) {
    throw new Error("The confirmation run ID does not match the approved historical run");
  }

  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  if (
    parsed.runId !== HISTORICAL_FULL_REPLACEMENT_RUN_ID
    || parsed.membershipSource !== AUTHORITATIVE_MEMBERSHIP_SOURCE
    || !Array.isArray(parsed.userIds)
    || !parsed.userIds.every((value) => typeof value === "string")
  ) {
    throw new Error("The authoritative membership manifest is invalid");
  }

  const result = await backfillHistoricalFullReplacementMarkers({
    runId: parsed.runId,
    membershipSource: parsed.membershipSource,
    userIds: parsed.userIds,
  });
  process.stdout.write(
    `FULL_REPLACEMENT ownership marker backfill completed for ${result.updatedCount} users.\n`,
  );
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.name : "BackfillError"}: backfill refused\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });