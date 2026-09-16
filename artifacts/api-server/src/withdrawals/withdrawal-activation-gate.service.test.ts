import { afterEach, describe, expect, it } from "vitest";
import { evaluateWithdrawalActivationGate } from "./withdrawal-activation-gate.service";

const originalDryRun = process.env["BLOCKCHAIN_DRY_RUN"];
const originalAddress = process.env["HOT_WALLET_ADDRESS"];
const originalPrivateKey = process.env["HOT_WALLET_PRIVATE_KEY"];

afterEach(() => {
  if (originalDryRun === undefined) delete process.env["BLOCKCHAIN_DRY_RUN"];
  else process.env["BLOCKCHAIN_DRY_RUN"] = originalDryRun;
  if (originalAddress === undefined) delete process.env["HOT_WALLET_ADDRESS"];
  else process.env["HOT_WALLET_ADDRESS"] = originalAddress;
  if (originalPrivateKey === undefined) delete process.env["HOT_WALLET_PRIVATE_KEY"];
  else process.env["HOT_WALLET_PRIVATE_KEY"] = originalPrivateKey;
});

describe("withdrawal activation gate", () => {
  it("allows the explicitly configured dry-run operating mode", async () => {
    process.env["BLOCKCHAIN_DRY_RUN"] = "true";
    const result = await evaluateWithdrawalActivationGate();
    expect(result).toEqual({ allowed: true, liveMode: false, reasons: [] });
  });

  it("fails closed before live processing when wallet credentials are missing", async () => {
    process.env["BLOCKCHAIN_DRY_RUN"] = "false";
    delete process.env["HOT_WALLET_ADDRESS"];
    delete process.env["HOT_WALLET_PRIVATE_KEY"];
    const result = await evaluateWithdrawalActivationGate();
    expect(result.allowed).toBe(false);
    expect(result.liveMode).toBe(true);
    expect(result.reasons).toContain("HOT_WALLET_ADDRESS is missing");
    expect(result.reasons).toContain("HOT_WALLET_PRIVATE_KEY is missing");
  });
});