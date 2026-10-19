import { describe, expect, it } from "vitest";
import { formatMaterialCode, nextMaterialCode } from "./material-code";

describe("formatMaterialCode", () => {
  it("zero-pads to eight digits (R01)", () => {
    expect(formatMaterialCode(1)).toBe("00000001");
    expect(formatMaterialCode(12345678)).toBe("12345678");
  });
});

describe("nextMaterialCode", () => {
  it("starts an empty tenant at 00000001 (MAT-001)", () => {
    expect(nextMaterialCode(null)).toBe("00000001");
  });

  it("follows the highest ID (MAT-002)", () => {
    expect(nextMaterialCode("00000001")).toBe("00000002");
    expect(nextMaterialCode("00000041")).toBe("00000042");
    expect(nextMaterialCode("99999998")).toBe("99999999");
  });

  it("refuses to go past eight digits", () => {
    expect(() => nextMaterialCode("99999999")).toThrow(
      expect.objectContaining({ code: "MATERIAL_IDS_EXHAUSTED", status: 409 }),
    );
  });
});
