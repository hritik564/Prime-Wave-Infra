/**
 * Convert a human-readable token amount into the exact integer amount used
 * by an ERC-20/BEP-20 contract. This intentionally rejects exponent notation,
 * signs, malformed decimals, and precision beyond the token's decimals.
 */
export function parseTokenAmount(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Token decimals must be an integer between 0 and 255");
  }

  const normalized = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    throw new Error(`Invalid token amount: ${value}`);
  }

  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`Token amount has more than ${decimals} decimal places`);
  }

  const scale = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole) * scale;
  const fractionUnits = fraction.length === 0
    ? 0n
    : BigInt(fraction.padEnd(decimals, "0"));

  return wholeUnits + fractionUnits;
}

export function tokenAmountToDecimal(units: bigint, decimals: number): string {
  if (units < 0n) throw new Error("Token amount cannot be negative");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Token decimals must be an integer between 0 and 255");
  }

  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const fraction = units % scale;
  if (decimals === 0 || fraction === 0n) return whole.toString();

  return `${whole}.${fraction.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}