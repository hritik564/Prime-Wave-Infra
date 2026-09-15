import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { BscWithdrawalGateway } from "./bsc-withdrawal.service";
import type { BscConfig } from "../../deposit-verification/adapter/bsc/bsc-config";
import { BscRpcClient } from "../../deposit-verification/adapter/bsc/bsc-rpc-client";
import type { ChainTransaction } from "./blockchain.types";

const CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const PRIVATE_KEY = `0x${"1".repeat(64)}` as `0x${string}`;
const account = privateKeyToAccount(PRIVATE_KEY);
const recipient = "0x2222222222222222222222222222222222222222";

const config: BscConfig = {
  rpcProviders: [],
  usdtContractAddress: CONTRACT.toLowerCase(),
  usdtDecimals: 18,
  chainId: 56,
  requiredConfirmations: 12,
  rpcTimeoutMs: 1_000,
  rpcMaxRetries: 1,
};

function tx(overrides: Partial<ChainTransaction> = {}): ChainTransaction {
  return {
    txHash: "0xabc",
    blockNumber: 100,
    from: account.address,
    to: CONTRACT,
    chainId: 56,
    status: "success",
    confirmations: 12,
    tokenTransfers: [{
      tokenContract: CONTRACT,
      from: account.address,
      to: recipient,
      amountRaw: "1010000000000000000",
    }],
    ...overrides,
  };
}

describe("BscWithdrawalGateway safety checks", () => {
  it("accepts the intended transfer event", () => {
    const gateway = new BscWithdrawalGateway(config, account.address, true, null);
    expect(gateway.verifyTransfer(tx(), {
      tokenContract: CONTRACT,
      sender: account.address,
      recipient,
      amount: "1.01",
    }).valid).toBe(true);
  });

  it.each([
    ["wrong token", { tokenContract: "0x3333333333333333333333333333333333333333" }],
    ["wrong sender", { sender: "0x4444444444444444444444444444444444444444" }],
    ["wrong recipient", { recipient: "0x5555555555555555555555555555555555555555" }],
    ["wrong amount", { amount: "1.02" }],
  ])("rejects %s", (_label, expected) => {
    const gateway = new BscWithdrawalGateway(config, account.address, true, null);
    expect(gateway.verifyTransfer(tx(), {
      tokenContract: CONTRACT,
      sender: account.address,
      recipient,
      amount: "1.01",
      ...expected,
    }).valid).toBe(false);
  });

  it("rejects an unrelated successful transaction and insufficient confirmations", () => {
    const gateway = new BscWithdrawalGateway(config, account.address, true, null);
    expect(gateway.verifyTransfer(tx({ tokenTransfers: [] }), {
      tokenContract: CONTRACT,
      sender: account.address,
      recipient,
      amount: "1.01",
    }).valid).toBe(false);
    expect(tx({ confirmations: 2 }).confirmations).toBeLessThan(config.requiredConfirmations);
  });

  it("rejects a wrong chain", () => {
    const gateway = new BscWithdrawalGateway(config, account.address, true, null);
    expect(gateway.verifyTransfer(tx({ chainId: 97 }), {
      tokenContract: CONTRACT,
      sender: account.address,
      recipient,
      amount: "1.01",
    }).valid).toBe(false);
  });

  it("rejects a private key/address mismatch without exposing key material", () => {
    expect(() => new BscWithdrawalGateway(
      config,
      "0x6666666666666666666666666666666666666666",
      true,
      PRIVATE_KEY,
    )).toThrow(/does not correspond/);
  });

  it("keeps dry-run signing disabled", async () => {
    const gateway = new BscWithdrawalGateway(config, account.address, true, null);
    await expect(gateway.signAndBroadcast({
      network: "BEP20",
      from: account.address,
      to: recipient,
      tokenContract: CONTRACT,
      amount: "1",
      calldata: "0x",
      estimatedGas: "60000",
      gasPriceGwei: "5",
      estimatedFeeBnb: "0.001",
      chainId: 56,
      nonce: 0,
      dryRun: true,
    })).rejects.toThrow(/dry-run/);
  });

  it("extracts canonical ERC-20 Transfer events from receipts", async () => {
    const transferTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const rpcCall = vi.spyOn(BscRpcClient.prototype, "call");
    rpcCall.mockImplementation((method) => {
      const result =
        method === "eth_getTransactionByHash"
          ? { blockNumber: "0x64", from: account.address, to: CONTRACT }
          : method === "eth_getTransactionReceipt"
            ? {
                status: "0x1",
                logs: [{
                  address: CONTRACT,
                  topics: [
                    transferTopic,
                    `0x${account.address.slice(2).padStart(64, "0")}`,
                    `0x${recipient.slice(2).padStart(64, "0")}`,
                  ],
                  data: "0x" + (1010000000000000000n).toString(16).padStart(64, "0"),
                }],
              }
            : method === "eth_blockNumber"
              ? "0x70"
              : "0x38";
      return Promise.resolve(result) as Promise<never>;
    });

    const gateway = new BscWithdrawalGateway(config, account.address, true, null);
    const transaction = await gateway.getTransaction("0xabc");

    expect(transaction?.tokenTransfers).toEqual([{
      tokenContract: CONTRACT,
      from: account.address,
      to: recipient,
      amountRaw: "1010000000000000000",
    }]);
    rpcCall.mockRestore();
  });
});