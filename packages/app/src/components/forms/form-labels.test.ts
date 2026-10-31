import { describe, expect, it } from "vitest";
import { baseUnitTip, chosenBaseUnit, errorFormatter, fill, localeQuantity, shownQuantity, TALL_DIALOG } from "./form-labels";

describe("fill", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    expect(fill("Edit {id} in {unit}", { id: "00000001" })).toBe("Edit 00000001 in {unit}");
  });
});

describe("errorFormatter", () => {
  it("says a known code in the screen's words and keeps the server's message otherwise", () => {
    const format = errorFormatter({ errors: { CONFLICT: "Taken." } });

    expect(format({ code: "CONFLICT", message: "x" })).toBe("Taken.");
    expect(format({ code: "SOMETHING_ELSE", message: "As the server said." })).toBe("As the server said.");
  });
});

describe("shownQuantity", () => {
  it("drops trailing zeros from a stored six-decimal quantity, and keeps everything else", () => {
    expect(shownQuantity("50.000000")).toBe("50");
    expect(shownQuantity("100.000000")).toBe("100");
    expect(shownQuantity("0.500000")).toBe("0.5");
    expect(shownQuantity("0.000001")).toBe("0.000001");
    expect(shownQuantity("0.000000")).toBe("0");
    expect(shownQuantity("120")).toBe("120");
  });
});

describe("localeQuantity", () => {
  it("shows a stored quantity in English and Polish, signed with a hyphen-minus, without trailing zeros", () => {
    expect(localeQuantity("1234.500000", "en")).toBe("1,234.5");
    expect(localeQuantity("1234.500000", "pl")).toBe("1234,5");
    expect(localeQuantity("-15.500000", "en")).toBe("-15.5");
    expect(localeQuantity("-15.500000", "pl")).toBe("-15,5");
    expect(localeQuantity("40.000000", "pl")).toBe("40");
    expect(localeQuantity("0.000001", "en")).toBe("0.000001");
  });

  it("keeps every digit of a value no binary float holds, grouped as the locale groups (R03)", () => {
    expect(localeQuantity("12345678901234.123456", "en")).toBe("12,345,678,901,234.123456");
    // Polish groups from five digits, with a no-break space.
    expect(localeQuantity("12345678901234.123456", "pl")).toBe("12\u00a0345\u00a0678\u00a0901\u00a0234,123456");
  });
});

describe("TALL_DIALOG", () => {
  it("keeps a dialog within the window and scrolls its content", () => {
    expect(TALL_DIALOG).toBe("max-h-[calc(100dvh-2rem)] overflow-y-auto");
  });
});

describe("baseUnitTip and chosenBaseUnit", () => {
  const materials = [
    { value: "00000001", code: "00000001", name: "Bolt M8", detail: "each" },
    { value: "00000002", code: "00000002", name: "Flour", detail: "kg" },
  ];

  it("name the chosen material's base unit in a quantity tooltip, and fall back to the general text until one is chosen (UX-014, #290)", () => {
    const tip = baseUnitTip("In {baseUnit}, to six decimals.", "In the material's base unit, to six decimals.", chosenBaseUnit(materials));

    expect(tip({})).toBe("In the material's base unit, to six decimals.");
    expect(tip({ material: "00000099" })).toBe("In the material's base unit, to six decimals.");
    expect(tip({ material: "00000002" })).toBe("In kg, to six decimals.");
    expect(baseUnitTip("In {baseUnit}.", "general", () => "each")({})).toBe("In each.");
  });
});
