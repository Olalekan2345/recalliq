import { describe, expect, it } from "vitest";
import { compareAtomic, formatAtomic, parseDisplayAmount, powerOfTenMismatch, sumAtomic, toBigInt } from "@/lib/blockchain/sui/amounts";

describe("formatAtomic", () => {
  it("converts atomic units with integer math", () => {
    expect(formatAtomic(1_500_000_000n, 9)).toBe("1.5");
    expect(formatAtomic("1", 9)).toBe("0.000000001");
    expect(formatAtomic("-16488301", 9)).toBe("-0.016488301");
    expect(formatAtomic("1000000", 6)).toBe("1");
    expect(formatAtomic("0", 9)).toBe("0");
    expect(formatAtomic("123", 0)).toBe("123");
  });

  it("handles u64-max-scale values without float precision loss", () => {
    expect(formatAtomic("18446744073709551615", 9)).toBe("18446744073.709551615");
    expect(formatAtomic("100000000000000000", 9, { group: true })).toBe("100,000,000");
  });

  it("truncates fraction digits only when asked", () => {
    expect(formatAtomic("1234567891", 9, { maxFractionDigits: 3 })).toBe("1.234");
  });

  it("rejects invalid decimals and non-integers", () => {
    expect(() => formatAtomic("1", -1)).toThrow();
    expect(() => toBigInt("1.5")).toThrow();
    expect(() => toBigInt(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
});

describe("parseDisplayAmount", () => {
  it("round-trips with formatAtomic", () => {
    for (const [v, d] of [
      ["1.5", 9],
      ["0.000000001", 9],
      ["-2.25", 6],
      ["1,000.5", 6],
    ] as const) {
      const atomic = parseDisplayAmount(v, d);
      expect(atomic).not.toBeNull();
      expect(formatAtomic(atomic!, d)).toBe(v.replace(/,/g, ""));
    }
  });

  it("rejects more precision than the coin supports", () => {
    expect(parseDisplayAmount("1.0000000001", 9)).toBeNull();
    expect(parseDisplayAmount("1.50000000000", 9)).toBe(1_500_000_000n);
    expect(parseDisplayAmount("abc", 9)).toBeNull();
  });
});

describe("powerOfTenMismatch", () => {
  it("detects decimal-scaling mistakes", () => {
    expect(powerOfTenMismatch(1_500_000_000n * 1_000_000_000n, 1_500_000_000n)).toBe(9);
    expect(powerOfTenMismatch(15n, 1_500_000_000n)).toBe(-8);
    expect(powerOfTenMismatch(-1500n, -15n)).toBe(2);
  });
  it("returns null for non power-of-ten differences", () => {
    expect(powerOfTenMismatch(3n, 7n)).toBeNull();
    expect(powerOfTenMismatch(5n, 5n)).toBeNull();
    expect(powerOfTenMismatch(0n, 10n)).toBeNull();
  });
});

describe("helpers", () => {
  it("sums and compares exactly", () => {
    expect(sumAtomic(["1", 2n, "-3"])).toBe(0n);
    expect(compareAtomic("10", "9")).toBe(1);
  });
});
