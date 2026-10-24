import { describe, expect, it } from "vitest";
import { unitSchema } from "../materials/material-fields.schema";
import { isRegisteredUnit, registeredUnitSchema, UNIT_DIMENSIONS, UNIT_NOT_REGISTERED_MESSAGE, UNITS } from "./unit-registry";

const message = (result: { error?: { issues: { message: string }[] } }) => result.error?.issues[0]?.message;

describe("the unit registry", () => {
  it("gives every unit a unique code and symbol, a known dimension and both names", () => {
    expect(new Set(UNITS.map((unit) => unit.code)).size).toBe(UNITS.length);
    expect(new Set(UNITS.map((unit) => unit.symbol)).size).toBe(UNITS.length);
    for (const unit of UNITS) {
      expect(UNIT_DIMENSIONS).toContain(unit.dimension);
      expect(unit.name.en).not.toBe("");
      expect(unit.name.pl).not.toBe("");
    }
  });

  it("stores only symbols the unit format accepts, so a registered unit is a valid unit everywhere", () => {
    for (const unit of UNITS) expect(unitSchema.parse(unit.symbol)).toBe(unit.symbol);
  });

  it("covers every dimension and every unit the demonstration datasets use", () => {
    expect(new Set(UNITS.map((unit) => unit.dimension))).toEqual(new Set(UNIT_DIMENSIONS));
    for (const symbol of ["each", "kg", "l", "ml", "t", "bag", "box", "bundle", "case", "pallet", "spool"]) {
      expect(isRegisteredUnit(symbol)).toBe(true);
    }
  });

  it("matches symbols exactly", () => {
    expect(isRegisteredUnit("kg")).toBe(true);
    expect(isRegisteredUnit("KG")).toBe(false);
    expect(isRegisteredUnit("kgs")).toBe(false);
  });
});

describe("registeredUnitSchema", () => {
  it("trims and accepts a registered unit", () => {
    expect(registeredUnitSchema.parse(" kg ")).toBe("kg");
    expect(registeredUnitSchema.parse("m³")).toBe("m³");
  });

  it("refuses a well-formed unit outside the registry", () => {
    expect(message(registeredUnitSchema.safeParse("kgs"))).toBe(UNIT_NOT_REGISTERED_MESSAGE);
  });

  it("gives a blank, missing or malformed unit the same message", () => {
    for (const unit of ["", "k g", undefined, 1]) expect(message(registeredUnitSchema.safeParse(unit))).toBe(UNIT_NOT_REGISTERED_MESSAGE);
  });
});
