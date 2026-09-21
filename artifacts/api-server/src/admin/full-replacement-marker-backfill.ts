import { prisma } from "../config/prisma";

export const HISTORICAL_FULL_REPLACEMENT_RUN_ID =
  "cmuaw52yf004vj1h61tpbr14w";
export const HISTORICAL_FULL_REPLACEMENT_USER_COUNT = 6_640;
export const AUTHORITATIVE_MEMBERSHIP_SOURCE =
  "AUTHORITATIVE_USER_ID_MANIFEST";

export class FullReplacementMarkerBackfillError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FullReplacementMarkerBackfillError";
  }
}

type BackfillTransaction = {
  commonTemporaryPasswordResetRun: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        operationType: true;
        status: true;
        totalEligible: true;
        processedCount: true;
        failedCount: true;
      };
    }): Promise<{
      id: string;
      operationType: "COMMON_TEMPORARY_PASSWORD" | "FULL_REPLACEMENT";
      status: "PREPARING" | "RUNNING" | "COMPLETED" | "FAILED";
      totalEligible: number;
      processedCount: number;
      failedCount: number;
    } | null>;
  };
  user: {
    count(args: {
      where: {
        id: { in: string[] };
        fullReplacementPasswordResetRunId?:
          | null
          | { not: null }
          | string;
      };
    }): Promise<number>;
    updateMany(args: {
      where: {
        id: { in: string[] };
        fullReplacementPasswordResetRunId: null;
      };
      data: { fullReplacementPasswordResetRunId: string };
    }): Promise<{ count: number }>;
  };
};

type BackfillDatabase = {
  $transaction<T>(
    callback: (transaction: BackfillTransaction) => Promise<T>,
    options: { isolationLevel: "Serializable" },
  ): Promise<T>;
};

export interface FullReplacementMarkerBackfillInput {
  runId: string;
  membershipSource: string;
  userIds: readonly string[];
}

function fail(code: string, message: string): never {
  throw new FullReplacementMarkerBackfillError(code, message);
}

function validateManifest(input: FullReplacementMarkerBackfillInput): string[] {
  if (input.runId !== HISTORICAL_FULL_REPLACEMENT_RUN_ID) {
    fail("WRONG_RUN_ID", "The manifest run ID is not the approved historical run");
  }
  if (input.membershipSource !== AUTHORITATIVE_MEMBERSHIP_SOURCE) {
    fail(
      "AMBIGUOUS_POPULATION",
      "An authoritative per-user ID manifest is required; inferred selections are forbidden",
    );
  }
  if (input.userIds.length !== HISTORICAL_FULL_REPLACEMENT_USER_COUNT) {
    fail(
      "INCORRECT_MANIFEST_COUNT",
      `The manifest must contain exactly ${HISTORICAL_FULL_REPLACEMENT_USER_COUNT} user IDs`,
    );
  }

  const userIds = input.userIds.map((userId) => userId.trim());
  if (userIds.some((userId) => userId.length === 0)) {
    fail("INVALID_USER_ID", "The manifest contains an empty user ID");
  }
  if (new Set(userIds).size !== HISTORICAL_FULL_REPLACEMENT_USER_COUNT) {
    fail("DUPLICATE_USER_ID", "The manifest must contain unique user IDs");
  }
  return userIds;
}

export async function backfillHistoricalFullReplacementMarkers(
  input: FullReplacementMarkerBackfillInput,
  db: BackfillDatabase = prisma as unknown as BackfillDatabase,
): Promise<{ runId: string; updatedCount: number }> {
  const userIds = validateManifest(input);

  return db.$transaction(async (transaction) => {
    const run = await transaction.commonTemporaryPasswordResetRun.findUnique({
      where: { id: input.runId },
      select: {
        id: true,
        operationType: true,
        status: true,
        totalEligible: true,
        processedCount: true,
        failedCount: true,
      },
    });

    if (!run) fail("RUN_NOT_FOUND", "The approved FULL_REPLACEMENT run does not exist");
    if (run.operationType !== "FULL_REPLACEMENT") {
      fail("RUN_OPERATION_MISMATCH", "The approved run is not a FULL_REPLACEMENT run");
    }
    if (run.status !== "COMPLETED") {
      fail("RUN_NOT_COMPLETED", "The approved FULL_REPLACEMENT run is not completed");
    }
    if (
      run.totalEligible !== HISTORICAL_FULL_REPLACEMENT_USER_COUNT
      || run.processedCount !== HISTORICAL_FULL_REPLACEMENT_USER_COUNT
      || run.failedCount !== 0
    ) {
      fail(
        "RUN_COUNT_MISMATCH",
        "The approved run does not have the exact expected successful population",
      );
    }

    const selectedCount = await transaction.user.count({
      where: { id: { in: userIds } },
    });
    if (selectedCount !== HISTORICAL_FULL_REPLACEMENT_USER_COUNT) {
      fail("TARGET_USER_MISSING", "One or more authoritative target users are missing");
    }

    const existingMarkerCount = await transaction.user.count({
      where: {
        id: { in: userIds },
        fullReplacementPasswordResetRunId: { not: null },
      },
    });
    if (existingMarkerCount !== 0) {
      fail(
        "TARGET_ALREADY_MARKED",
        "At least one target user already has a FULL_REPLACEMENT ownership marker",
      );
    }

    const updated = await transaction.user.updateMany({
      where: {
        id: { in: userIds },
        fullReplacementPasswordResetRunId: null,
      },
      data: {
        fullReplacementPasswordResetRunId: input.runId,
      },
    });
    if (updated.count !== HISTORICAL_FULL_REPLACEMENT_USER_COUNT) {
      fail("UPDATE_COUNT_MISMATCH", "The marker update did not affect exactly 6,640 users");
    }

    const verifiedCount = await transaction.user.count({
      where: {
        id: { in: userIds },
        fullReplacementPasswordResetRunId: input.runId,
      },
    });
    if (verifiedCount !== HISTORICAL_FULL_REPLACEMENT_USER_COUNT) {
      fail("POST_UPDATE_VERIFICATION_FAILED", "The marker backfill verification failed");
    }

    return { runId: input.runId, updatedCount: updated.count };
  }, { isolationLevel: "Serializable" });
}