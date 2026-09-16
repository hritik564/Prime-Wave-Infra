import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({
  transaction: vi.fn(),
}));
const observedQueries: Array<{ template: unknown; walletAddress: string }> = [];

vi.mock("../../config/prisma", () => ({
  prisma: { $transaction: transaction },
}));

import { withDistributedNonceLock } from "./nonce-manager";

type LockClient = { $queryRaw: ReturnType<typeof vi.fn> };

function installAdvisoryLockSimulation() {
  const tails = new Map<string, Promise<void>>();
  observedQueries.length = 0;

  transaction.mockImplementation(async (callback: (tx: LockClient) => Promise<unknown>) => {
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });

    const tx: LockClient = {
      $queryRaw: vi.fn(async (_template: unknown, walletAddress: string) => {
        observedQueries.push({ template: _template, walletAddress });
        const previous = tails.get(walletAddress) ?? Promise.resolve();
        tails.set(walletAddress, current);
        await previous;
        return [{ locked: 1 }];
      }),
    };

    try {
      return await callback(tx);
    } finally {
      release();
      for (const [key, tail] of tails) {
        if (tail === current) tails.delete(key);
      }
    }
  });
}

describe("withDistributedNonceLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAdvisoryLockSimulation();
  });

  it("acquires the transaction-scoped advisory lock through a scalar Prisma result", async () => {
    const result = await withDistributedNonceLock("0xABC", async () => "ok");

    expect(result).toBe("ok");
    expect(observedQueries).toHaveLength(1);
    expect(String(observedQueries[0].template)).toContain('SELECT 1 AS "locked"');
    expect(String(observedQueries[0].template)).toContain("pg_advisory_xact_lock");
    expect(observedQueries[0].walletAddress).toBe("0xabc");
  });

  it("serializes concurrent workers for the same wallet", async () => {
    const entered: string[] = [];
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withDistributedNonceLock("0xsame", async () => {
      entered.push("first");
      await firstHeld;
      entered.push("first-done");
    });
    await Promise.resolve();

    const second = withDistributedNonceLock("0xSAME", async () => {
      entered.push("second");
    });
    await Promise.resolve();

    expect(entered).toEqual(["first"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(entered).toEqual(["first", "first-done", "second"]);
  });

  it("does not block different wallet lock keys", async () => {
    const entered: string[] = [];
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withDistributedNonceLock("0xone", async () => {
      entered.push("one");
      await firstHeld;
    });
    await Promise.resolve();

    const second = withDistributedNonceLock("0xtwo", async () => {
      entered.push("two");
    });
    await second;

    expect(entered).toEqual(["one", "two"]);
    releaseFirst();
    await first;
  });

  it("releases the transaction-scoped lock when the transaction finishes", async () => {
    await withDistributedNonceLock("0xrelease", async () => undefined);

    await expect(
      withDistributedNonceLock("0xrelease", async () => "reused"),
    ).resolves.toBe("reused");
  });
});