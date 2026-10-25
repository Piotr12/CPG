import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { activeMaterialOptions, materialFilterOptions, materialOptions, materialPicker, materialPickerLabels, withUnlisted } from "./material-picker";

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

  it("offers only active materials to a new entry (MAT-029)", () => {
    const material = { id: "00000001", description: "Bolt M8", baseUnit: "each", active: true };
    expect(activeMaterialOptions([material, { ...material, id: "00000002", active: false }])).toEqual([
      { value: "00000001", code: "00000001", name: "Bolt M8", detail: "each" },
    ]);
  });

  it("offers a filter every material, marking the inactive ones (#222)", () => {
    const material = { id: "00000001", description: "Bolt M8", active: true };
    expect(materialFilterOptions([material, { ...material, id: "00000002", active: false }], "Inactive")).toEqual([
      { value: "00000001", code: "00000001", name: "Bolt M8" },
      { value: "00000002", code: "00000002", name: "Bolt M8", detail: "Inactive" },
    ]);
  });

  it("keeps a filter's value that names no record as its own option, not in the list (#222)", () => {
    const options = [{ value: "00000001", code: "00000001", name: "Bolt M8" }];
    expect(withUnlisted(options, "00000099", en.lists.notListed)).toEqual([...options, { value: "00000099", code: "00000099", name: "not in the list" }]);
    expect(withUnlisted(options, "00000001", en.lists.notListed)).toBe(options);
    expect(withUnlisted(options, undefined, en.lists.notListed)).toBe(options);
    expect(withUnlisted(options, "", en.lists.notListed)).toBe(options);
  });

  it("gives every form the same words and placeholder, in the reader's language", () => {
    expect(materialPicker(pl.lists)).toEqual({ labels: materialPickerLabels(pl.lists), placeholder: "Wpisz ID albo nazwę" });
  });
});
