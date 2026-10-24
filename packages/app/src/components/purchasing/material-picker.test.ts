import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { documentMaterialPicker } from "./material-picker";

describe("documentMaterialPicker", () => {
  it("takes the shared picker's words and placeholder from the reader's dictionary, as plain data", () => {
    expect(documentMaterialPicker(en)).toEqual({
      labels: { results: en.lists.materialPicker.results, noMatch: en.lists.materialPicker.noMatch, more: en.lists.materialPicker.more, refused: "Choose a material from the list." },
      placeholder: "Type an ID or a name",
    });
    expect(documentMaterialPicker(pl).placeholder).toBe(pl.lists.materialPicker.placeholder);
    expect(JSON.parse(JSON.stringify(documentMaterialPicker(pl)))).toEqual(documentMaterialPicker(pl));
  });
});
