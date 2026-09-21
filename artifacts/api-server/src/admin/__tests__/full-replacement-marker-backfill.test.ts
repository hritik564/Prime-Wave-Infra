import { describe, expect, it, vi } from "vitest";
import {
  AUTHORITATIVE_MEMBERSHIP_SOURCE,
  HISTORICAL_FULL_REPLACEMENT_RUN_ID,
  HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
  backfillHistoricalFullReplacementMarkers,
} from "../full-replacement-marker-backfill";

const userIds = Array.from(
  { length: HISTORICAL_FULL_REPLACEMENT_USER_COUNT },
  (_, index) => `user-${String(index).padStart(5, "0")}`,
);

function createDatabase(options?: {
  run?: {
    id: string;
    operationType: "COMMON_TEMPORARY_PASSWORD" | "FULL_REPLACEMENT";
    status: "PREPARING" | "RUNNING" | "COMPLETED" | "FAILED";
    totalEligible: number;
    processedCount: number;
    failedCount: number;
  } | null;
  selectedCount?: number;
  existingMarkerCount?: number;
  updatedCount?: number;
  verifiedCount?: number;
}) {
  const run = options?.run === undefined
    ? {
        id: HISTORICAL_FULL_REPLACEMENT_RUN_ID,
        operationType: "FULL_REPLACEMENT" as const,
        status: "COMPLETED" as const,
        totalEligible: HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
        processedCount: HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
        failedCount: 0,
      }
    : options.run;
  const userCount = vi.fn()
    .mockResolvedValueOnce(
      options?.selectedCount ?? HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
    )
    .mockResolvedValueOnce(options?.existingMarkerCount ?? 0)
    .mockResolvedValueOnce(
      options?.verifiedCount ?? HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
    );
  const transaction = {
    commonTemporaryPasswordResetRun: {
      findUnique: vi.fn().mockResolvedValue(run),
    },
    user: {
      count: userCount,
      updateMany: vi.fn().mockResolvedValue({
        count: options?.updatedCount ?? HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
      }),
    },
  };
  const transactionCall = vi.fn();
  return {
    transaction,
    transactionCall,
    db: {
      async $transaction<T>(
        callback: (tx: typeof transaction) => Promise<T>,
        options: { isolationLevel: "Serializable" },
      ): Promise<T> {
        transactionCall(options);
        return callback(transaction);
      },
    },
  };
}

function validInput() {
  return {
    runId: HISTORICAL_FULL_REPLACEMENT_RUN_ID,
    membershipSource: AUTHORITATIVE_MEMBERSHIP_SOURCE,
    userIds,
  };
}

describe("historical FULL_REPLACEMENT marker backfill safeguards", () => {
  it("updates only the marker after every exact safeguard passes", async () => {
    const fake = createDatabase();

    await expect(backfillHistoricalFullReplacementMarkers(
      validInput(),
      fake.db,
    )).resolves.toEqual({
      runId: HISTORICAL_FULL_REPLACEMENT_RUN_ID,
      updatedCount: HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
    });

    expect(fake.transaction.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: userIds },
        fullReplacementPasswordResetRunId: null,
      },
      data: {
        fullReplacementPasswordResetRunId: HISTORICAL_FULL_REPLACEMENT_RUN_ID,
      },
    });
  });

  it("refuses a wrong run ID", async () => {
    const fake = createDatabase();
    await expect(backfillHistoricalFullReplacementMarkers(
      { ...validInput(), runId: "wrong-run" },
      fake.db,
    )).rejects.toMatchObject({ code: "WRONG_RUN_ID" });
    expect(fake.transactionCall).not.toHaveBeenCalled();
  });

  it("refuses a non-completed run", async () => {
    const fake = createDatabase({
      run: {
        id: HISTORICAL_FULL_REPLACEMENT_RUN_ID,
        operationType: "FULL_REPLACEMENT",
        status: "FAILED",
        totalEligible: HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
        processedCount: HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
        failedCount: 0,
      },
    });
    await expect(backfillHistoricalFullReplacementMarkers(
      validInput(),
      fake.db,
    )).rejects.toMatchObject({ code: "RUN_NOT_COMPLETED" });
  });

  it("refuses incorrect run counts", async () => {
    const fake = createDatabase({
      run: {
        id: HISTORICAL_FULL_REPLACEMENT_RUN_ID,
        operationType: "FULL_REPLACEMENT",
        status: "COMPLETED",
        totalEligible: HISTORICAL_FULL_REPLACEMENT_USER_COUNT,
        processedCount: HISTORICAL_FULL_REPLACEMENT_USER_COUNT - 1,
        failedCount: 0,
      },
    });
    await expect(backfillHistoricalFullReplacementMarkers(
      validInput(),
      fake.db,
    )).rejects.toMatchObject({ code: "RUN_COUNT_MISMATCH" });
  });

  it("refuses an ambiguous inferred population", async () => {
    const fake = createDatabase();
    await expect(backfillHistoricalFullReplacementMarkers(
      { ...validInput(), membershipSource: "TIMESTAMP_WINDOW" },
      fake.db,
    )).rejects.toMatchObject({ code: "AMBIGUOUS_POPULATION" });
    expect(fake.transactionCall).not.toHaveBeenCalled();
  });

  it("refuses a missing target user", async () => {
    const fake = createDatabase({
      selectedCount: HISTORICAL_FULL_REPLACEMENT_USER_COUNT - 1,
    });
    await expect(backfillHistoricalFullReplacementMarkers(
      validInput(),
      fake.db,
    )).rejects.toMatchObject({ code: "TARGET_USER_MISSING" });
  });

  it("refuses any existing non-null marker", async () => {
    const fake = createDatabase({ existingMarkerCount: 1 });
    await expect(backfillHistoricalFullReplacementMarkers(
      validInput(),
      fake.db,
    )).rejects.toMatchObject({ code: "TARGET_ALREADY_MARKED" });
    expect(fake.transaction.user.updateMany).not.toHaveBeenCalled();
  });
});