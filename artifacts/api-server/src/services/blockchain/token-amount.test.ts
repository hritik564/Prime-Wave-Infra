import { describe, expect, it } from "vitest";
import { parseTokenAmount, tokenAmountToDecimal } from "./token-amount";

describe("exact token amount conversion", () => {
  it.each([
    ["1", 1_000_000_000_000_000_000n],
    ["1.01", 1_010_000_000_000_000_000n],
    ["10.50", 10_500_000_000_000_000_000n],
    ["2500", 2_500_000_000_000_000_000_000n],
    ["0.000000000000000001", 1n],
    ["0", 0n],
  ])("converts %s exactly", (value, expected) => {
    expect(parseTokenAmount(value, 18)).toBe(expected);
  });

  it.each(["1.0000000000000000001", "1.1234567890123456789"])(
    "rejects excessive precision: %s",
    (value) => expect(() => parseTokenAmount(value, 18)).toThrow(),
  );

  it.each(["", "1e3", "+1", "-1", "01", "1.", ".1", "abc"])(
    "rejects malformed amount: %s",
    (value) => expect(() => parseTokenAmount(value, 18)).toThrow(),
  );

  it("round-trips without floating-point arithmetic", () => {
    const units = parseTokenAmount("10.500000000000000001", 18);
    expect(tokenAmountToDecimal(units, 18)).toBe("10.500000000000000001");
  });
});