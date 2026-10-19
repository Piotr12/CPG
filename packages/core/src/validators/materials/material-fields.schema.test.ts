import { MATERIAL_DESCRIPTION_MAX, MATERIAL_TYPES as DB_MATERIAL_TYPES, MATERIAL_UNIT_MAX } from "@cpg/db";
import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_REQUIRED_MESSAGE,
  DESCRIPTION_TOO_LONG_MESSAGE,
  descriptionSchema,
  FACTOR_MESSAGE,
  factorSchema,
  MATERIAL_TYPES,
  materialIdSchema,
  materialTypeSchema,
  TYPE_MESSAGE,
  UNIT_FORMAT_MESSAGE,
  UNIT_MAX,
  unitSchema,
} from "./material-fields.schema";

const message = (result: { error?: { issues: { message: string }[] } }) => result.error?.issues[0]?.message;

describe("materialTypeSchema", () => {
  it("lists the same types, and fits the same column lengths, as the database", () => {
    expect(MATERIAL_TYPES).toEqual(DB_MATERIAL_TYPES);
    expect(DESCRIPTION_MAX).toBe(MATERIAL_DESCRIPTION_MAX);
    expect(UNIT_MAX).toBe(MATERIAL_UNIT_MAX);
  });

  it("accepts the three documented types (MAT-006)", () => {
    for (const type of MATERIAL_TYPES) expect(materialTypeSchema.parse(type)).toBe(type);
  });

  it.each([undefined, "", "Raw", "service", 1])("refuses %j with one readable message (MAT-005, MAT-007)", (type) => {
    expect(message(materialTypeSchema.safeParse(type))).toBe(TYPE_MESSAGE);
  });
});

describe("descriptionSchema", () => {
  it("trims and keeps up to the maximum length", () => {
    expect(descriptionSchema.parse("  Bolt M8 ")).toBe("Bolt M8");
    expect(descriptionSchema.parse("x".repeat(DESCRIPTION_MAX))).toHaveLength(DESCRIPTION_MAX);
  });

  it("is required (MAT-008)", () => {
    expect(message(descriptionSchema.safeParse(undefined))).toBe(DESCRIPTION_REQUIRED_MESSAGE);
    expect(message(descriptionSchema.safeParse("   "))).toBe(DESCRIPTION_REQUIRED_MESSAGE);
  });

  it("refuses a description that is too long", () => {
    expect(message(descriptionSchema.safeParse("x".repeat(DESCRIPTION_MAX + 1)))).toBe(DESCRIPTION_TOO_LONG_MESSAGE);
  });
});

describe("unitSchema", () => {
  it.each(["kg", "each", "Mg", "mg", "szt.", "m3", "fl.oz", "big_box", "kart-on", "ł", "x".repeat(16)])(
    "accepts %j as typed",
    (unit) => {
      expect(unitSchema.parse(unit)).toBe(unit);
    },
  );

  it("trims but keeps the case: Mg and mg stay different units", () => {
    expect(unitSchema.parse(" Mg ")).toBe("Mg");
  });

  it.each([undefined, "", " ", "kg/m", "fl oz", ".kg", "-kg", "x".repeat(17), "kg?", "%2F"])(
    "refuses %j (MAT-008 for a missing base unit)",
    (unit) => {
      expect(message(unitSchema.safeParse(unit))).toBe(UNIT_FORMAT_MESSAGE);
    },
  );
});

describe("factorSchema", () => {
  it("accepts positive decimal strings and canonicalizes them", () => {
    expect(factorSchema.parse("12")).toBe("12");
    expect(factorSchema.parse("12.50")).toBe("12.5");
    expect(factorSchema.parse(" 0.000001 ")).toBe("0.000001");
    expect(factorSchema.parse("007")).toBe("7");
  });

  it.each(["0", "0.000000", "-1", "1e3", "0.0000001", "", "abc", 12, null])(
    "refuses %j: zero, negative, malformed, or a JSON number (MAT-022, R03)",
    (value) => {
      expect(message(factorSchema.safeParse(value))).toBe(FACTOR_MESSAGE);
    },
  );
});

describe("materialIdSchema", () => {
  it("accepts exactly eight digits", () => {
    expect(materialIdSchema.safeParse("00000001").success).toBe(true);
    for (const id of ["1", "0000001", "000000001", "0000000a", "", "00000001 "]) {
      expect(materialIdSchema.safeParse(id).success).toBe(false);
    }
  });
});
