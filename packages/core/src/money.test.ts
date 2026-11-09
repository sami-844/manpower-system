import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { omr, roundBaisa, formatOmr, sumOmr } from "./money";

describe("money (OMR, 3 decimals)", () => {
  it("avoids floating point error", () => {
    expect(sumOmr(["0.100", "0.200"]).toFixed(3)).toBe("0.300");
  });

  it("rounds to the baisa with banker's rounding by default", () => {
    expect(roundBaisa(omr("1.0005")).toFixed(3)).toBe("1.000");
    expect(roundBaisa(omr("1.0015")).toFixed(3)).toBe("1.002");
    expect(roundBaisa(omr("1.00051")).toFixed(3)).toBe("1.001");
  });

  it("can round half up when a rule says so", () => {
    expect(roundBaisa(omr("1.0005"), "half_up").toFixed(3)).toBe("1.001");
  });

  it("formats for display", () => {
    expect(formatOmr(omr("1234.5"))).toBe("OMR 1,234.500");
    expect(formatOmr(omr("-12.3456"))).toBe("-OMR 12.346");
  });

  it("rejects numbers to stop float money entering the system", () => {
    // @ts-expect-error numbers are not allowed on purpose
    expect(() => omr(0.1)).toThrow(/string/i);
  });

  it("rejects non-numeric strings", () => {
    expect(() => omr("12,5")).toThrow();
  });

  it("property: sum of rounded parts never drifts more than half a baisa per part", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 10_000_000 }), { maxLength: 50 }), (cents) => {
        const parts = cents.map((c) => (c / 10_000).toFixed(4));
        const exact = sumOmr(parts);
        const rounded = sumOmr(parts.map((p) => roundBaisa(omr(p)).toFixed(3)));
        return exact.minus(rounded).abs().lte(omr("0.0005").times(Math.max(parts.length, 1)));
      }),
    );
  });
});

describe("money input and output edge cases", () => {
  it.each(["1e3", "NaN", "Infinity", " 12", "12 ", "12.", ".5", "+5", "12.5abc", "abc12.5"])(
    "rejects %j",
    (v) => {
      expect(() => omr(v)).toThrow(`Not a valid amount: "${v}"`);
    },
  );

  it("accepts whole numbers and negatives", () => {
    expect(omr("12").toFixed(3)).toBe("12.000");
    expect(omr("-0.5").toFixed(3)).toBe("-0.500");
  });

  it("keeps full precision on large amounts", () => {
    expect(omr("123456789012.345").plus(omr("0.001")).toFixed(3)).toBe("123456789012.346");
  });

  it("sums a mix of strings and amounts", () => {
    expect(sumOmr(["1.250", omr("2.250")]).toFixed(3)).toBe("3.500");
    expect(sumOmr([]).toFixed(3)).toBe("0.000");
  });

  it("groups thousands correctly", () => {
    expect(formatOmr(omr("1234567.891"))).toBe("OMR 1,234,567.891");
    expect(formatOmr(omr("999"))).toBe("OMR 999.000");
    expect(formatOmr(omr("0"))).toBe("OMR 0.000");
  });

  it("formats using banker's rounding by default", () => {
    expect(formatOmr(omr("0.0005"))).toBe("OMR 0.000");
    expect(formatOmr(omr("0.0015"))).toBe("OMR 0.002");
  });
});
