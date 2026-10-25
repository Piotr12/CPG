import { describe, expect, it } from "vitest";
import { formatDecimal, parseDecimal } from "../quantities/decimal";
import { fromBase, NO_STATISTICAL_FACTOR, reportUnits, resolveReportUnit, statisticalFactor, type ReportMaterial } from "./report-units";

const micro = (text: string) => parseDecimal(text)!;
const factor = (numerator: string, denominator: string) => ({ numerator: micro(numerator), denominator: micro(denominator) });
const shown = (base: string, numerator: string, denominator: string) => formatDecimal(fromBase(micro(base), factor(numerator, denominator)), { fixed: true });

/** 1 each = 1.5 SU, 1 pallet = 10 each, 1 case = 2 each. */
const cabinet: ReportMaterial = {
  code: "00000021",
  baseUnit: "each",
  conversions: [
    { unit: "pallet", numerator: "10", denominator: "1" },
    { unit: "SU", numerator: "1", denominator: "1.5" },
    { unit: "case", numerator: "2", denominator: "1" },
  ],
};
const letterbox: ReportMaterial = { code: "00000023", baseUnit: "each", conversions: [{ unit: "case", numerator: "6", denominator: "1" }] };
/** A base unit SU stored before the unit registry (#217). */
const legacy: ReportMaterial = { code: "00000099", baseUnit: "SU", conversions: [{ unit: "box", numerator: "4", denominator: "1" }] };

describe("fromBase", () => {
  it("turns base quantities into the factor's unit, against hand-computed values", () => {
    // 1 each = 1.5 SU: 3 each are 4.5 SU.
    expect(shown("3", "1", "1.5")).toBe("4.500000");
    // 1 SU = 0.333333 each: 1 each is 1 ÷ 0.333333 = 3.0000030000… SU.
    expect(shown("1", "0.333333", "1")).toBe("3.000003");
    // 1 pallet = 10 each: 25 each are 2.5 pallets.
    expect(shown("25", "10", "1")).toBe("2.500000");
  });

  it("rounds half-up once, to six decimals, and a tiny total to zero rather than an error", () => {
    expect(shown("0.000001", "1", "0.5")).toBe("0.000001");
    expect(shown("0.000001", "1", "0.4")).toBe("0.000000");
  });
});

describe("statisticalFactor", () => {
  it("is the material's SU conversion, null without one, and 1:1 for a legacy base unit SU", () => {
    expect(statisticalFactor(cabinet)).toEqual(factor("1", "1.5"));
    expect(statisticalFactor(letterbox)).toBeNull();
    expect(statisticalFactor(legacy)).toEqual(factor("1", "1"));
    expect(NO_STATISTICAL_FACTOR).toBe("NO_STATISTICAL_FACTOR");
  });
});

describe("reportUnits", () => {
  it("offers only SU for all materials (none selected) or two and more, even sharing a base unit (Q5)", () => {
    expect(reportUnits([])).toEqual({ units: ["SU"], defaultUnit: "SU" });
    expect(reportUnits([cabinet, letterbox])).toEqual({ units: ["SU"], defaultUnit: "SU" });
  });

  it("offers one material's base unit, its other units in order, then SU when it has a factor", () => {
    expect(reportUnits([cabinet])).toEqual({ units: ["each", "case", "pallet", "SU"], defaultUnit: "each" });
    expect(reportUnits([letterbox])).toEqual({ units: ["each", "case"], defaultUnit: "each" });
  });

  it("lists a legacy base unit SU once, as the base unit", () => {
    expect(reportUnits([legacy])).toEqual({ units: ["SU", "box"], defaultUnit: "SU" });
  });
});

describe("resolveReportUnit", () => {
  it("keeps a unit the selection allows", () => {
    expect(resolveReportUnit("pallet", [cabinet])).toBe("pallet");
    expect(resolveReportUnit("SU", [cabinet, letterbox])).toBe("SU");
  });

  it("turns a stale or missing unit into the default", () => {
    // `unit=pallet` left over from a one-product view, after a second product is added.
    expect(resolveReportUnit("pallet", [cabinet, letterbox])).toBe("SU");
    expect(resolveReportUnit("SU", [letterbox])).toBe("each");
    expect(resolveReportUnit(undefined, [cabinet])).toBe("each");
    expect(resolveReportUnit(undefined, [])).toBe("SU");
  });
});
