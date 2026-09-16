import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../config/prisma";
import {
  claimPendingWithdrawals,
  recoverExpiredClaims,
  releaseDryRunClaim,
  transitionClaimedWithdrawal,
} from "./withdrawal-claims.service";
import {
  completeWithdrawal,
  moveToManualReview,
} from "./withdrawal-confirmation.service";

const integrationEnabled = process.env["RUN_WITHDRAWAL_INTEGRATION"] === "1";

type Fixture = {
  userId: string;
  withdrawalId: string;
};

const fixtures: Fixture[] = [];

describe.skipIf(!integrationEnabled)("withdrawal development PostgreSQL integration", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    for (const fixture of fixtures.reverse()) {
      await prisma.withdrawalEvent.deleteMany({
        where: { withdrawalId: fixture.withdrawalId },
      });
      await prisma.walletTransaction.deleteMany({
        where: { withdrawalRequestId: fixture.withdrawalId },
      });
      await prisma.withdrawalRequest.deleteMany({
        where: { id: fixture.withdrawalId },
      });
      await prisma.wallet.deleteMany({
        where: { userId: fixture.userId },
      });
      await prisma.user.deleteMany({
        where: { id: fixture.userId },
      });
    }
    await prisma.$disconnect();
  });

  it("allows exactly one of two concurrent workers to claim one withdrawal", async () => {
    const fixture = await createFixture("claim", "25");
    const holdCutoff = new Date(Date.now() + 60_000);

    const [workerA, workerB] = await Promise.all([
      claimPendingWithdrawals(holdCutoff, 1, "phase15-worker-a", [fixture.withdrawalId]),
      claimPendingWithdrawals(holdCutoff, 1, "phase15-worker-b", [fixture.withdrawalId]),
    ]);

    const winners = [workerA, workerB].filter((claims) => claims.length === 1);
    const losers = [workerA, workerB].filter((claims) => claims.length === 0);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(winners[0][0].id).toBe(fixture.withdrawalId);
    expect(winners[0][0].claimToken).toBeTruthy();

    const row = await prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id: fixture.withdrawalId },
      select: { status: true, claimOwner: true, claimToken: true, claimExpiresAt: true },
    });
    expect(row.status).toBe("QUEUED");
    expect(["phase15-worker-a", "phase15-worker-b"]).toContain(row.claimOwner);
    expect(row.claimToken).toBe(winners[0][0].claimToken);
    expect(row.claimExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(row.claimExpiresAt?.getTime()).toBeLessThan(Date.now() + 6 * 60_000);

    const secondClaim = await claimPendingWithdrawals(
      holdCutoff,
      1,
      "phase15-worker-c",
      [fixture.withdrawalId],
    );
    expect(secondClaim).toEqual([]);
  });

  it("completes a real withdrawal exactly once under concurrent completion attempts", async () => {
    const fixture = await createFixture("completion", "25");
    const txHash = `0x${"ab".repeat(32)}`;

    await prisma.withdrawalRequest.update({
      where: { id: fixture.withdrawalId },
      data: {
        status: "CONFIRMING",
        txHash,
        broadcastAt: new Date(),
      },
    });

    await Promise.all([
      completeWithdrawal(fixture.withdrawalId, 123, 12, txHash, fixture.withdrawalId),
      completeWithdrawal(fixture.withdrawalId, 123, 12, txHash, fixture.withdrawalId),
    ]);

    const [withdrawal, wallet, ledgerRows] = await Promise.all([
      prisma.withdrawalRequest.findUniqueOrThrow({
        where: { id: fixture.withdrawalId },
        select: { status: true, completedAt: true, confirmationBlock: true, confirmationCount: true },
      }),
      prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.userId } }),
      prisma.walletTransaction.findMany({
        where: { withdrawalRequestId: fixture.withdrawalId },
      }),
    ]);

    expect(withdrawal.status).toBe("COMPLETED");
    expect(withdrawal.completedAt).not.toBeNull();
    expect(withdrawal.confirmationBlock).toBe(123);
    expect(withdrawal.confirmationCount).toBe(12);
    expect(wallet.withdrawalWallet.toString()).toBe("100");
    expect(wallet.lockedWithdrawalBalance.toString()).toBe("0");
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].status).toBe("SUCCESS");
    expect(ledgerRows[0].withdrawalRequestId).toBe(fixture.withdrawalId);

    await completeWithdrawal(fixture.withdrawalId, 123, 12, txHash, fixture.withdrawalId);
    expect(
      await prisma.walletTransaction.count({
        where: { withdrawalRequestId: fixture.withdrawalId },
      }),
    ).toBe(1);
    expect(
      (await prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.userId } }))
        .lockedWithdrawalBalance.toString(),
    ).toBe("0");
  });

  it("moves an ambiguous broadcast to manual review without refunding or creating a ledger row", async () => {
    const fixture = await createFixture("unknown", "30");
    const claimed = await claimPendingWithdrawals(
      new Date(Date.now() + 60_000),
      1,
      "phase15-broadcast-worker",
      [fixture.withdrawalId],
    );
    const claimToken = claimed[0].claimToken;

    expect(await transitionClaimedWithdrawal(
      fixture.withdrawalId,
      claimToken,
      ["QUEUED"],
      "PROCESSING",
      {},
      "phase15-broadcast-worker",
    )).toBe(true);
    expect(await transitionClaimedWithdrawal(
      fixture.withdrawalId,
      claimToken,
      ["PROCESSING"],
      "SIGNED",
      {},
      "phase15-broadcast-worker",
    )).toBe(true);
    expect(await transitionClaimedWithdrawal(
      fixture.withdrawalId,
      claimToken,
      ["SIGNED"],
      "BROADCASTING",
      {},
      "phase15-broadcast-worker",
    )).toBe(true);
    expect(await transitionClaimedWithdrawal(
      fixture.withdrawalId,
      claimToken,
      ["BROADCASTING"],
      "BROADCAST_UNKNOWN",
      {
        broadcastUnknownAt: new Date(),
        broadcastUnknownReason: "development integration timeout",
      },
      "phase15-broadcast-worker",
    )).toBe(true);

    const beforeReview = await prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id: fixture.withdrawalId },
      select: { status: true, claimToken: true, broadcastUnknownReason: true },
    });
    expect(beforeReview.status).toBe("BROADCAST_UNKNOWN");
    expect(beforeReview.claimToken).toBeNull();
    expect(beforeReview.broadcastUnknownReason).toBe("development integration timeout");

    await moveToManualReview(fixture.withdrawalId, "development reconciliation required");
    await moveToManualReview(fixture.withdrawalId, "duplicate reconciliation attempt");

    const [withdrawal, wallet, ledgerCount, manualReviewEventCount] = await Promise.all([
      prisma.withdrawalRequest.findUniqueOrThrow({
        where: { id: fixture.withdrawalId },
        select: { status: true },
      }),
      prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.userId } }),
      prisma.walletTransaction.count({ where: { withdrawalRequestId: fixture.withdrawalId } }),
      prisma.withdrawalEvent.count({
        where: { withdrawalId: fixture.withdrawalId, eventType: "MANUAL_REVIEW" },
      }),
    ]);
    expect(withdrawal.status).toBe("MANUAL_REVIEW");
    expect(wallet.withdrawalWallet.toString()).toBe("100");
    expect(wallet.lockedWithdrawalBalance.toString()).toBe("30");
    expect(ledgerCount).toBe(0);
    expect(manualReviewEventCount).toBe(1);
  });

  it("recovers only stale PROCESSING claims and serializes concurrent recovery", async () => {
    const recent = await createFixture("recent-processing", "10");
    const stale = await createFixture("stale-processing", "11");
    const future = new Date(Date.now() + 5 * 60_000);
    const past = new Date(Date.now() - 5 * 60_000);

    await prisma.withdrawalRequest.updateMany({
      where: { id: { in: [recent.withdrawalId, stale.withdrawalId] } },
      data: {
        status: "PROCESSING",
        claimOwner: "phase15-recovery-worker",
        claimToken: undefined,
        claimExpiresAt: future,
      },
    });
    await prisma.withdrawalRequest.update({
      where: { id: stale.withdrawalId },
      data: { claimToken: `stale-${randomUUID()}`, claimExpiresAt: past },
    });

    await Promise.all([
      recoverExpiredClaims([recent.withdrawalId, stale.withdrawalId]),
      recoverExpiredClaims([recent.withdrawalId, stale.withdrawalId]),
    ]);

    const [recentRow, staleRow, recentWallet, staleWallet, staleEventCount] = await Promise.all([
      prisma.withdrawalRequest.findUniqueOrThrow({
        where: { id: recent.withdrawalId },
        select: { status: true },
      }),
      prisma.withdrawalRequest.findUniqueOrThrow({
        where: { id: stale.withdrawalId },
        select: { status: true, claimToken: true, broadcastUnknownAt: true },
      }),
      prisma.wallet.findUniqueOrThrow({ where: { userId: recent.userId } }),
      prisma.wallet.findUniqueOrThrow({ where: { userId: stale.userId } }),
      prisma.withdrawalEvent.count({
        where: { withdrawalId: stale.withdrawalId, eventType: "BROADCAST_UNKNOWN" },
      }),
    ]);

    expect(recentRow.status).toBe("PROCESSING");
    expect(staleRow.status).toBe("BROADCAST_UNKNOWN");
    expect(staleRow.claimToken).toBeNull();
    expect(staleRow.broadcastUnknownAt).not.toBeNull();
    expect(recentWallet.lockedWithdrawalBalance.toString()).toBe("10");
    expect(staleWallet.lockedWithdrawalBalance.toString()).toBe("11");
    expect(staleEventCount).toBe(1);
  });

  it("validates the real state path through CONFIRMING and rejects terminal reprocessing", async () => {
    const fixture = await createFixture("state-path", "12");
    const worker = "phase15-state-worker";
    const claim = await claimPendingWithdrawals(
      new Date(Date.now() + 60_000),
      1,
      worker,
      [fixture.withdrawalId],
    );
    const token = claim[0].claimToken;

    expect(await transitionClaimedWithdrawal(fixture.withdrawalId, token, ["QUEUED"], "PROCESSING", {}, worker)).toBe(true);
    expect(await transitionClaimedWithdrawal(fixture.withdrawalId, token, ["PROCESSING"], "SIGNED", {}, worker)).toBe(true);
    expect(await transitionClaimedWithdrawal(fixture.withdrawalId, token, ["SIGNED"], "BROADCASTING", {}, worker)).toBe(true);

    const txHash = `0x${"cd".repeat(32)}`;
    expect(await transitionClaimedWithdrawal(
      fixture.withdrawalId,
      token,
      ["BROADCASTING"],
      "CONFIRMING",
      { txHash, broadcastAt: new Date() },
      worker,
    )).toBe(true);
    await completeWithdrawal(fixture.withdrawalId, 456, 12, txHash, fixture.withdrawalId);

    expect(await transitionClaimedWithdrawal(
      fixture.withdrawalId,
      token,
      ["BROADCASTING"],
      "PROCESSING",
      {},
      worker,
    )).toBe(false);
    expect(
      (await prisma.withdrawalRequest.findUniqueOrThrow({
        where: { id: fixture.withdrawalId },
        select: { status: true },
      })).status,
    ).toBe("COMPLETED");
  });

  it("returns a pre-signing processor failure to PENDING without accounting effects or duplicate events", async () => {
    const fixture = await createFixture("processor-failure", "18");
    const claim = await claimPendingWithdrawals(
      new Date(Date.now() + 60_000),
      1,
      "phase15-failure-worker",
      [fixture.withdrawalId],
    );
    const token = claim[0].claimToken;

    expect(await transitionClaimedWithdrawal(
      fixture.withdrawalId,
      token,
      ["QUEUED"],
      "PROCESSING",
      {},
      "phase15-failure-worker",
    )).toBe(true);

    const beforeWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.userId } });
    expect(await releaseDryRunClaim(
      fixture.withdrawalId,
      token,
      "Blockchain gateway is not configured",
      "phase15-failure-worker",
    )).toBe(true);
    expect(await releaseDryRunClaim(
      fixture.withdrawalId,
      token,
      "duplicate failure",
      "phase15-failure-worker",
    )).toBe(false);

    const [withdrawal, afterWallet, refundRows, failureEvents] = await Promise.all([
      prisma.withdrawalRequest.findUniqueOrThrow({
        where: { id: fixture.withdrawalId },
        select: { status: true },
      }),
      prisma.wallet.findUniqueOrThrow({ where: { userId: fixture.userId } }),
      prisma.walletTransaction.findMany({ where: { withdrawalRequestId: fixture.withdrawalId } }),
      prisma.withdrawalEvent.findMany({
        where: { withdrawalId: fixture.withdrawalId, eventType: "PROCESSOR_FAILURE" },
      }),
    ]);

    expect(withdrawal.status).toBe("PENDING");
    expect(afterWallet.withdrawalWallet.toString()).toBe(beforeWallet.withdrawalWallet.toString());
    expect(afterWallet.lockedWithdrawalBalance.toString()).toBe(beforeWallet.lockedWithdrawalBalance.toString());
    expect(refundRows).toHaveLength(0);
    expect(failureEvents).toHaveLength(1);
    expect(failureEvents[0].details).toMatchObject({
      withdrawalId: fixture.withdrawalId,
      previousState: "PROCESSING",
      newState: "PENDING",
      failureClassification: "PRE_SIGNING_FAILURE",
      safeToRetry: true,
    });
  });
});

async function createFixture(label: string, amount: string): Promise<Fixture> {
  const marker = `phase15-${label}-${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      email: `${marker}@example.invalid`,
      username: marker,
      passwordHash: "phase15-integration-only",
      firstName: "Phase",
      lastName: "Fifteen",
      referralCode: marker,
      wallet: {
        create: {
          withdrawalWallet: new Prisma.Decimal("100"),
          lockedWithdrawalBalance: new Prisma.Decimal(amount),
        },
      },
    },
    select: { id: true },
  });

  const withdrawal = await prisma.withdrawalRequest.create({
    data: {
      userId: user.id,
      amount: new Prisma.Decimal(amount),
      fee: new Prisma.Decimal("0"),
      netAmount: new Prisma.Decimal(amount),
      walletAddress: "0x1111111111111111111111111111111111111111",
      walletAddressSnapshot: "0x1111111111111111111111111111111111111111",
      network: "BEP20",
      status: "APPROVED",
      requestedAt: new Date(Date.now() - 1_000),
      idempotencyKey: `${marker}-idempotency`,
    },
    select: { id: true },
  });

  const fixture = { userId: user.id, withdrawalId: withdrawal.id };
  fixtures.push(fixture);
  return fixture;
}