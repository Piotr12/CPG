import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { materialOptions, materialPickerLabels } from "./material-picker";

describe("material picker", () => {
  it("offers materials by ID and description, with the base unit as detail", () => {
    expect(materialOptions([{ id: "00000007", description: "Steel sheet 1.0 mm", baseUnit: "kg" }])).toEqual([
      { value: "00000007", code: "00000007", name: "Steel sheet 1.0 mm", detail: "kg" },
    ]);
  });

  it("takes its words from the dictionary, as plain strings", () => {
    const labels = materialPickerLabels(en.lists);
    expect(labels).toEqual({
      results: en.lists.materialPicker.results,
      noMatch: "No material matches “{text}”.",
      more: en.lists.materialPicker.more,
      refused: "Choose a material from the list.",
    });
    expect(Object.values(labels).some((value) => typeof value === "function")).toBe(false);
  });
});
