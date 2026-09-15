import os from "node:os";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { logger } from "../lib/logger";
import { logWithdrawalEvent } from "./withdrawal-events.service";

export const WITHDRAWAL_CLAIM_LEASE_MS = 5 * 60_000;

// Stable for the life of one API process, unique across concurrent instances.
export const WITHDRAWAL_WORKER_ID =
  `${os.hostname()}:${process.pid}:${randomUUID()}`;

type ClaimRow = { id: string; claimToken: string };

export async function claimPendingWithdrawals(
  holdCutoff: Date,
  limit: number,
  workerId: string = WITHDRAWAL_WORKER_ID,
  onlyIds?: readonly string[],
): Promise<Array<{
  id: string;
  withdrawalId: string | null;
  idempotencyKey: string;
  userId: string;
  amount: object;
  network: "BEP20";
  walletAddressSnapshot: string;
  requestedAt: Date;
  claimToken: string;
}>> {
  const claimed: ClaimRow[] = [];

  while (claimed.length < limit) {
    const claimToken = randomUUID();
    const candidateScope = onlyIds
      ? Prisma.sql`AND "id" IN (${Prisma.join(onlyIds)})`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<ClaimRow[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "withdrawal_requests"
        WHERE "status" = 'PENDING'::"WithdrawalStatus"
          AND "requestedAt" <= ${holdCutoff}
          ${candidateScope}
        ORDER BY "requestedAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "withdrawal_requests" AS wr
      SET
        "status" = 'VALIDATING'::"WithdrawalStatus",
        "claimOwner" = ${workerId},
        "claimToken" = ${claimToken},
        "claimExpiresAt" = NOW() + (${WITHDRAWAL_CLAIM_LEASE_MS} * INTERVAL '1 millisecond'),
        "updatedAt" = NOW()
      FROM candidate
      WHERE wr."id" = candidate."id"
        AND wr."status" = 'PENDING'::"WithdrawalStatus"
      RETURNING wr."id", wr."claimToken";
    `;

    if (rows.length === 0) break;
    claimed.push({ id: rows[0].id, claimToken });
  }

  if (claimed.length === 0) return [];

  const rows = await prisma.withdrawalRequest.findMany({
    where: { id: { in: claimed.map((row) => row.id) } },
    select: {
      id: true,
      withdrawalId: true,
      idempotencyKey: true,
      userId: true,
      amount: true,
      network: true,
      walletAddressSnapshot: true,
      requestedAt: true,
      claimToken: true,
    },
  });

  const tokenById = new Map(claimed.map((row) => [row.id, row.claimToken]));
  return rows.map((row) => ({
    ...row,
    claimToken: row.claimToken ?? tokenById.get(row.id)!,
  }));
}

export async function renewWithdrawalClaim(
  id: string,
  claimToken: string,
): Promise<boolean> {
  const result = await prisma.withdrawalRequest.updateMany({
    where: {
      id,
      claimOwner: WITHDRAWAL_WORKER_ID,
      claimToken,
      claimExpiresAt: { gt: new Date() },
      status: { in: ["VALIDATING", "QUEUED", "PROCESSING", "SIGNED", "BROADCASTING"] },
    },
    data: { claimExpiresAt: new Date(Date.now() + WITHDRAWAL_CLAIM_LEASE_MS) },
  });
  return result.count === 1;
}

export async function transitionClaimedWithdrawal(
  id: string,
  claimToken: string,
  from: Array<"VALIDATING" | "QUEUED" | "PROCESSING" | "SIGNED" | "BROADCASTING">,
  to: "QUEUED" | "PROCESSING" | "SIGNED" | "BROADCASTING" | "CONFIRMING" | "FAILED" | "MANUAL_REVIEW" | "BROADCAST_UNKNOWN",
  data: Record<string, unknown> = {},
  workerId: string = WITHDRAWAL_WORKER_ID,
): Promise<boolean> {
  const result = await prisma.withdrawalRequest.updateMany({
    where: {
      id,
      claimOwner: workerId,
      claimToken,
      claimExpiresAt: { gt: new Date() },
      status: { in: from },
    },
    data: {
      ...data,
      status: to,
      ...(to === "FAILED" || to === "MANUAL_REVIEW" || to === "BROADCAST_UNKNOWN"
        ? { claimOwner: null, claimToken: null, claimExpiresAt: null }
        : {}),
    },
  });
  return result.count === 1;
}

export async function releaseDryRunClaim(
  id: string,
  claimToken: string,
  reason: string,
): Promise<boolean> {
  const result = await prisma.withdrawalRequest.updateMany({
    where: {
      id,
      claimOwner: WITHDRAWAL_WORKER_ID,
      claimToken,
      status: { in: ["VALIDATING", "QUEUED", "PROCESSING"] },
    },
    data: {
      status: "MANUAL_REVIEW",
      failureReason: reason,
      claimOwner: null,
      claimToken: null,
      claimExpiresAt: null,
    },
  });
  return result.count === 1;
}

export async function recoverExpiredClaims(onlyIds?: readonly string[]): Promise<void> {
  const candidateScope = onlyIds
    ? Prisma.sql`AND "id" IN (${Prisma.join(onlyIds)})`
    : Prisma.empty;
  const recovered = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    UPDATE "withdrawal_requests"
    SET
      "status" = CASE
        WHEN "status" IN ('VALIDATING'::"WithdrawalStatus", 'QUEUED'::"WithdrawalStatus")
          THEN 'PENDING'::"WithdrawalStatus"
        WHEN "status" = 'PROCESSING'::"WithdrawalStatus"
          THEN 'BROADCAST_UNKNOWN'::"WithdrawalStatus"
        ELSE "status"
      END,
      "failureReason" = CASE
        WHEN "status" = 'PROCESSING'::"WithdrawalStatus"
          THEN 'Worker claim expired during PROCESSING; blockchain outcome requires reconciliation.'
        ELSE "failureReason"
      END,
      "broadcastUnknownAt" = CASE
        WHEN "status" = 'PROCESSING'::"WithdrawalStatus" THEN NOW()
        ELSE "broadcastUnknownAt"
      END,
      "broadcastUnknownReason" = CASE
        WHEN "status" = 'PROCESSING'::"WithdrawalStatus"
          THEN 'Claim expired while transaction outcome was unknown.'
        ELSE "broadcastUnknownReason"
      END,
      "claimOwner" = NULL,
      "claimToken" = NULL,
      "claimExpiresAt" = NULL,
      "updatedAt" = NOW()
    WHERE "claimExpiresAt" IS NOT NULL
      AND "claimExpiresAt" <= NOW()
      AND "status" IN (
        'VALIDATING'::"WithdrawalStatus",
        'QUEUED'::"WithdrawalStatus",
        'PROCESSING'::"WithdrawalStatus"
      )
      ${candidateScope}
    RETURNING "id", "status";
  `;

  for (const row of recovered) {
    await logWithdrawalEvent(row.id, row.status === "BROADCAST_UNKNOWN" ? "BROADCAST_UNKNOWN" : "RECOVERY_SCAN", {
      reason: "Withdrawal claim expired",
      recoveredStatus: row.status,
    });
  }

  if (recovered.length > 0) {
    logger.warn(
      { count: recovered.length },
      "WithdrawalClaims: expired claims recovered",
    );
  }
}

export async function releaseClaimAfterUnexpectedError(
  id: string,
  claimToken: string,
): Promise<void> {
  const row = await prisma.withdrawalRequest.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!row) return;

  if (row.status === "PROCESSING" || row.status === "SIGNED" || row.status === "BROADCASTING") {
    await transitionClaimedWithdrawal(
      id,
      claimToken,
      ["PROCESSING", "SIGNED", "BROADCASTING"],
      "BROADCAST_UNKNOWN",
      {
        broadcastUnknownAt: new Date(),
        broadcastUnknownReason: "Unexpected worker error; blockchain outcome requires reconciliation.",
        failureReason: "Unexpected worker error; no automatic refund was issued.",
      },
    );
    return;
  }

  await prisma.withdrawalRequest.updateMany({
    where: { id, claimOwner: WITHDRAWAL_WORKER_ID, claimToken },
    data: {
      status: "PENDING",
      claimOwner: null,
      claimToken: null,
      claimExpiresAt: null,
    },
  });
}