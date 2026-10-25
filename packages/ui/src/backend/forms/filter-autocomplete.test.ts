import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterAutocomplete } from "./filter-autocomplete";

const labels = { results: { other: "{count} results" }, noMatch: "None", more: { other: "{count} more" }, refused: "Choose from the list." };

describe("FilterAutocomplete on the server", () => {
  it("renders a native select a GET form can submit without JavaScript", () => {
    const html = renderToString(
      createElement(FilterAutocomplete, {
        id: "material",
        name: "material",
        defaultValue: "00000007",
        emptyLabel: "Any",
        labels,
        options: [
          { value: "00000001", code: "00000001", name: "Bolt M8" },
          { value: "00000007", code: "00000007", name: "Steel sheet", detail: "Inactive" },
        ],
      }),
    );

    expect(html).toContain('<select data-slot="native-select"');
    expect(html).toContain('name="material"');
    expect(html).not.toContain('role="combobox"');
    expect(html).toMatch(/<option[^>]*value=""[^>]*>Any<\/option>/);
    expect(html).toMatch(/<option[^>]*value="00000007"[^>]*selected=""[^>]*>00000007 — Steel sheet \(Inactive\)<\/option>/);
  });
});
