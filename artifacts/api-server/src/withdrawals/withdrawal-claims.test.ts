import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    withdrawalRequest: { findMany: vi.fn() },
  },
}));

vi.mock("../lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./withdrawal-events.service", () => ({
  logWithdrawalEvent: vi.fn(),
}));

import { prisma } from "../config/prisma";
import { claimPendingWithdrawals } from "./withdrawal-claims.service";

describe("database withdrawal claims", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims concurrent work through distinct atomic claim results", async () => {
    const available = ["withdrawal-a", "withdrawal-b"];
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const id = available.shift();
      return id ? [{ id, claimToken: `token-${id}` }] : [];
    });
    (prisma.withdrawalRequest.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          withdrawalId: id,
          idempotencyKey: `idem-${id}`,
          userId: "user-1",
          amount: { toString: () => "1.00" },
          network: "BEP20",
          walletAddressSnapshot: "0x1111111111111111111111111111111111111111",
          requestedAt: new Date(),
          claimToken: `token-${id}`,
        })),
    );

    const [first, second] = await Promise.all([
      claimPendingWithdrawals(new Date(), 1),
      claimPendingWithdrawals(new Date(), 1),
    ]);

    expect(first[0].id).not.toBe(second[0].id);
    expect(new Set([first[0].claimToken, second[0].claimToken]).size).toBe(2);
  });

  it("uses the automatic PENDING path while preserving legacy APPROVED claims", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.withdrawalRequest.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await claimPendingWithdrawals(new Date(), 1);

    const [query] = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0];
    const sql = Array.from(query as TemplateStringsArray).join(" ");
    expect(sql).toContain("'PENDING'::\"WithdrawalStatus\"");
    expect(sql).toContain("'APPROVED'::\"WithdrawalStatus\"");
    expect(sql).toContain('"requestedAt" <= ');
    expect(sql).toContain('"status" IN');
  });
});