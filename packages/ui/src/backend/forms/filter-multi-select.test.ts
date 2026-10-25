import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterMultiSelect } from "./filter-multi-select";

const labels = {
  all: "All finished products",
  selected: { other: "{count} selected" },
  search: "Search",
  shown: "{shown} of {total}",
  selectShown: "Select shown",
  clear: "Clear",
  noMatch: "None",
  more: { other: "+{count} more" },
  remove: "Remove {name}",
  inactive: "(inactive)",
};

describe("FilterMultiSelect on the server", () => {
  it("renders a native multiple select a GET form can submit without JavaScript", () => {
    const html = renderToString(
      createElement(FilterMultiSelect, {
        id: "material",
        name: "material",
        defaultValue: ["00000005", "00000007"],
        labels,
        disabled: true,
        options: [
          { value: "00000001", code: "00000001", name: "Bolt M8" },
          { value: "00000005", code: "00000005", name: "Cabinet", detail: "1 each = 1.5 SU" },
          { value: "00000007", code: "00000007", name: "Steel sheet", inactive: true },
        ],
      }),
    );

    expect(html).toMatch(/<select[^>]*id="material"[^>]*name="material"[^>]*multiple=""[^>]*disabled=""/);
    expect(html).not.toContain('type="hidden"');
    expect(html).not.toContain("All finished products");
    expect(html).toMatch(/<option[^>]*value="00000001">00000001 — Bolt M8<\/option>/);
    expect(html).toMatch(/<option[^>]*value="00000005"[^>]*selected=""[^>]*>00000005 — Cabinet \(1 each = 1.5 SU\)<\/option>/);
    expect(html).toMatch(/<option[^>]*value="00000007"[^>]*selected=""[^>]*>00000007 — Steel sheet \(inactive\)<\/option>/);
  });
});
