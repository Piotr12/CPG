import { describe, expect, it } from "vitest";
import { UNITS } from "@cpg/core/validators/units/unit-registry";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { unitChoices, unitSelect } from "./unit-choices";

describe("unitChoices", () => {
  it("groups every registered unit by dimension, in the registry's order, named in the reader's language", () => {
    const choices = unitChoices("en", en.units);

    expect(choices.groups.map((group) => group.label)).toEqual(["Count", "Packaging", "Mass", "Volume", "Length", "Area", "Time"]);
    expect(choices.groups.flatMap((group) => group.options.map((option) => option.value))).toEqual(UNITS.map((unit) => unit.symbol));
    // A unit named by its own symbol isn't repeated.
    expect(choices.groups[0].options.slice(0, 2)).toEqual([
      { value: "each", label: "each" },
      { value: "pcs", label: "pcs — piece" },
    ]);
    expect(unitChoices("pl", pl.units).groups[2]).toEqual({
      label: "Masa",
      options: [
        { value: "mg", label: "mg — miligram" },
        { value: "g", label: "g — gram" },
        { value: "kg", label: "kg — kilogram" },
        { value: "t", label: "t — tona" },
      ],
    });
  });
});

describe("unitSelect", () => {
  const choices = unitChoices("en", en.units);

  it("offers the groups alone for a registered or missing current unit", () => {
    expect(unitSelect(choices)).toEqual({ options: [], groups: choices.groups });
    expect(unitSelect(choices, { current: "kg" }).options).toEqual([]);
  });

  it("puts a stored unit the registry lacks first, saying so", () => {
    expect(unitSelect(choices, { current: "płyta" }).options).toEqual([{ value: "płyta", label: "płyta (not in the unit list)" }]);
  });

  it("keeps disabled units in place, saying why", () => {
    const mass = unitSelect(choices, { disabled: { kg: "base unit" } }).groups![2].options;
    expect(mass[2]).toEqual({ value: "kg", label: "kg — kilogram (base unit)", disabled: true });
    expect(mass[1]).toEqual({ value: "g", label: "g — gram" });
  });
});
