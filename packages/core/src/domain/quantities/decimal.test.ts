import { describe, expect, it } from "vitest";
import { compareDecimals, convertToBase, formatDecimal, inverseFactor, MAX_QUANTITY, ONE, parseDecimal } from "./decimal";

/** Parses a value the test knows is valid. */
const d = (text: string) => parseDecimal(text)!;
/** Converts `entered` at `numerator/denominator` and formats it as a stored quantity. */
const convert = (entered: string, numerator: string, denominator: string) =>
  formatDecimal(convertToBase(d(entered), d(numerator), d(denominator)), { fixed: true });

describe("parseDecimal", () => {
  it("reads whole numbers and up to six decimals as micro-units", () => {
    expect(parseDecimal("12")).toBe(12_000_000n);
    expect(parseDecimal("0.5")).toBe(500_000n);
    expect(parseDecimal("0.123456")).toBe(123_456n);
    expect(parseDecimal("0")).toBe(0n);
    expect(parseDecimal("007.10")).toBe(7_100_000n);
  });

  it("reads the largest value exactly, with no floating-point loss", () => {
    expect(parseDecimal("999999999999.999999")).toBe(MAX_QUANTITY);
  });

  it.each(["", "-1", "+1", "1e3", "0.0000001", "1234567890123", ".5", "5.", "1,5", " 1", "1 ", "0x10", "NaN"])(
    "refuses %j",
    (text) => {
      expect(parseDecimal(text)).toBeNull();
    },
  );
});

describe("compareDecimals (#224)", () => {
  it("compares stored decimal texts by value, whether or not they carry six decimals", () => {
    expect(["100.000000", "25", "9.5", "999999999999.000002", "0.000000", "999999999999.000001", "12.05"].sort(compareDecimals)).toEqual([
      "0.000000", "9.5", "12.05", "25", "100.000000", "999999999999.000001", "999999999999.000002",
    ]);
    expect(compareDecimals("12", "12.000000")).toBe(0);
    expect(compareDecimals("25", "100")).toBe(-1);
    expect(compareDecimals("100", "25")).toBe(1);
  });
});

describe("formatDecimal", () => {
  it("shows a stored quantity with six decimals", () => {
    expect(formatDecimal(24_000_000n, { fixed: true })).toBe("24.000000");
    expect(formatDecimal(333_333n, { fixed: true })).toBe("0.333333");
  });

  it("drops trailing zeros otherwise, as factors are shown", () => {
    expect(formatDecimal(12_000_000n)).toBe("12");
    expect(formatDecimal(500_000n)).toBe("0.5");
    expect(formatDecimal(0n)).toBe("0");
    expect(formatDecimal(1n)).toBe("0.000001");
  });

  it("round-trips with parseDecimal", () => {
    for (const text of ["12", "0.5", "0.453592", "999999999999.999999"]) {
      expect(formatDecimal(d(text))).toBe(text);
    }
  });
});

describe("convertToBase", () => {
  it("converts 2 cases at 1 case = 12 each into 24 each (MAT-019)", () => {
    expect(convert("2", "12", "1")).toBe("24.000000");
  });

  it("converts 0.25 tonne into 250 kg, not 0.25 (MAT-020)", () => {
    expect(convert("0.25", "1000", "1")).toBe("250.000000");
  });

  it("uses the numerator/denominator: 4 at 3/2 is 6 (MAT-021)", () => {
    expect(convert("4", "3", "2")).toBe("6.000000");
  });

  it("keeps an exact six-place base quantity (MAT-024)", () => {
    expect(convert("0.123456", "1", "1")).toBe("0.123456");
  });

  it("rounds a non-terminating result half-up once (MAT-032)", () => {
    expect(convert("1", "1", "3")).toBe("0.333333");
    expect(convert("2", "1", "3")).toBe("0.666667");
    // Exactly half a millionth rounds up: 0.000001 × 1/2 = 0.0000005.
    expect(convert("0.000001", "1", "2")).toBe("0.000001");
  });

  it("can round a tiny positive input to zero, which callers refuse", () => {
    expect(convertToBase(d("0.000001"), d("1"), d("3"))).toBe(0n);
  });

  it("computes beyond the stored range without overflow, so callers can refuse it", () => {
    const huge = convertToBase(MAX_QUANTITY, MAX_QUANTITY, d("0.000001"));
    expect(huge > MAX_QUANTITY).toBe(true);
    expect(convertToBase(d("999999999999"), d("1"), d("1"))).toBe(999_999_999_999n * ONE);
  });
});

describe("inverseFactor", () => {
  it("is denominator ÷ numerator, half-up to six decimals (MAT-021)", () => {
    expect(formatDecimal(inverseFactor(d("3"), d("2")))).toBe("0.666667");
    expect(formatDecimal(inverseFactor(d("12"), d("1")))).toBe("0.083333");
    expect(formatDecimal(inverseFactor(d("1"), d("3")))).toBe("3");
  });

  it("rounds to zero for a numerator of ten million or more", () => {
    expect(inverseFactor(d("10000000"), d("1"))).toBe(0n);
  });
});
