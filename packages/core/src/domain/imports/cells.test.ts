import { describe, expect, it } from "vitest";
import { activeValue, bomTarget, cellText, idText, isBlank, normalizeCell, plainNumber } from "./cells";

describe("isBlank", () => {
  it("treats empty, whitespace, null and undefined as blank", () => {
    for (const cell of ["", "   ", null, undefined]) expect(isBlank(cell)).toBe(true);
    for (const cell of ["x", 0, false, new Date(0)]) expect(isBlank(cell)).toBe(false);
  });
});

describe("plainNumber", () => {
  it("keeps ordinary numbers in their shortest form", () => {
    expect(plainNumber(1.5)).toBe("1.5");
    expect(plainNumber(0.1)).toBe("0.1");
    expect(plainNumber(42)).toBe("42");
    expect(plainNumber(-3.25)).toBe("-3.25");
  });

  it("writes exponent notation out in full", () => {
    expect(plainNumber(1e-7)).toBe("0.0000001");
    expect(plainNumber(1.25e-7)).toBe("0.000000125");
    expect(plainNumber(-1e-7)).toBe("-0.0000001");
    expect(plainNumber(1.5e21)).toBe("1500000000000000000000");
    expect(plainNumber(1.2345e21)).toBe("1234500000000000000000");
  });
});

describe("cellText", () => {
  it("reads each cell type as trimmed text", () => {
    expect(cellText("  Steel  ")).toBe("Steel");
    expect(cellText(1e-7)).toBe("0.0000001");
    expect(cellText(true)).toBe("TRUE");
    expect(cellText(false)).toBe("FALSE");
    expect(cellText(new Date(Date.UTC(2027, 0, 31)))).toBe("2027-01-31");
    expect(cellText(null)).toBeNull();
    expect(cellText("  ")).toBeNull();
  });

  it("reads an invalid date cell as empty text, which a date schema refuses", () => {
    expect(cellText(new Date(Number.NaN))).toBe("");
  });
});

describe("idText", () => {
  it("zero-pads whole numbers and short digit strings", () => {
    expect(idText(1)).toBe("00000001");
    expect(idText("1")).toBe("00000001");
    expect(idText(" 00000001 ")).toBe("00000001");
    expect(idText(99_999_999)).toBe("99999999");
    expect(idText(0)).toBe("00000000");
  });

  it("keeps anything else as text, for the ID schema to refuse", () => {
    expect(idText(100_000_000)).toBe("100000000");
    expect(idText(1.5)).toBe("1.5");
    expect(idText(-1)).toBe("-1");
    expect(idText("A1")).toBe("A1");
    expect(idText("123456789")).toBe("123456789");
    expect(idText(null)).toBeNull();
  });
});

describe("activeValue", () => {
  it("reads boolean cells and yes/no words in English and Polish, in any case", () => {
    expect(activeValue(true)).toBe(true);
    expect(activeValue(false)).toBe(false);
    for (const word of ["yes", "YES", "True", "tak"]) expect(activeValue(word)).toBe(true);
    for (const word of ["no", "No", "FALSE", "nie"]) expect(activeValue(word)).toBe(false);
  });

  it("reads blank as null and keeps anything else as text", () => {
    expect(activeValue(null)).toBeNull();
    expect(activeValue("maybe")).toBe("maybe");
    expect(activeValue(1)).toBe("1");
  });
});

describe("bomTarget", () => {
  it("reads digits as a BOM ID and anything else as an import reference", () => {
    expect(bomTarget(4)).toEqual({ kind: "id", id: "00000004" });
    expect(bomTarget("00000004")).toEqual({ kind: "id", id: "00000004" });
    expect(bomTarget(" BOM-X ")).toEqual({ kind: "reference", reference: "BOM-X" });
    expect(bomTarget(null)).toBeNull();
  });
});

describe("normalizeCell", () => {
  it("normalizes by the column's kind", () => {
    expect(normalizeCell("id", 7)).toBe("00000007");
    expect(normalizeCell("word", " RAW ")).toBe("raw");
    expect(normalizeCell("word", null)).toBeNull();
    expect(normalizeCell("active", "nie")).toBe(false);
    expect(normalizeCell("bom", "R1")).toEqual({ kind: "reference", reference: "R1" });
    expect(normalizeCell("text", 2.5)).toBe("2.5");
    expect(normalizeCell("date", new Date(Date.UTC(2027, 1, 3)))).toBe("2027-02-03");
    expect(normalizeCell("date", "2027-02-03")).toBe("2027-02-03");
  });
});
