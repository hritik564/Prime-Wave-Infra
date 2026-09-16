import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/blockchain/blockchain.factory", () => ({
  getWithdrawalGateway: vi.fn(),
  isGatewayConfigured: vi.fn(() => true),
}));

vi.mock("../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getWithdrawalGateway } from "../services/blockchain/blockchain.factory";
import { checkHotWalletStatus } from "./withdrawal-hot-wallet.service";

const originalThreshold = process.env["MIN_HOT_WALLET_BNB"];

describe("hot-wallet BNB threshold", () => {
  beforeEach(() => {
    process.env["MIN_HOT_WALLET_BNB"] = "0.0015";
    vi.mocked(getWithdrawalGateway).mockReturnValue({
      getHealth: vi.fn().mockResolvedValue({
        connected: true,
        hotWalletAddress: "0x1111111111111111111111111111111111111111",
        bnbBalance: "0.0014",
        usdtBalance: "10",
        gasPriceGwei: "1",
      }),
    } as never);
  });

  afterEach(() => {
    if (originalThreshold === undefined) delete process.env["MIN_HOT_WALLET_BNB"];
    else process.env["MIN_HOT_WALLET_BNB"] = originalThreshold;
    vi.clearAllMocks();
  });

  it("pauses processing below the configured 0.0015 BNB minimum", async () => {
    const result = await checkHotWalletStatus();

    expect(result.minBnbRequired).toBe("0.0015");
    expect(result.bnbSufficient).toBe(false);
    expect(result.isSufficient).toBe(false);
    expect(result.alerts).toContain(
      "Low BNB: 0.001400 BNB available (minimum 0.0015 BNB required for gas)",
    );
  });

  it("allows the configured threshold boundary when the balance equals 0.0015 BNB", async () => {
    vi.mocked(getWithdrawalGateway).mockReturnValue({
      getHealth: vi.fn().mockResolvedValue({
        connected: true,
        hotWalletAddress: "0x1111111111111111111111111111111111111111",
        bnbBalance: "0.0015",
        usdtBalance: "10",
        gasPriceGwei: "1",
      }),
    } as never);

    const result = await checkHotWalletStatus();

    expect(result.minBnbRequired).toBe("0.0015");
    expect(result.bnbSufficient).toBe(true);
    expect(result.isSufficient).toBe(true);
    expect(result.alerts).toEqual([]);
  });
});