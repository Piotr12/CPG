import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { activeRecordOptions, recordOptions, recordPicker } from "./record-picker";

const main = { id: "00000001", name: "Main warehouse", active: true };
const old = { id: "00000002", name: "Old yard", active: false };

describe("record picker", () => {
  it("offers records by ID and name, marking inactive ones only when told how", () => {
    expect(recordOptions([main, old])).toEqual([
      { value: "00000001", code: "00000001", name: "Main warehouse" },
      { value: "00000002", code: "00000002", name: "Old yard" },
    ]);
    expect(recordOptions([main, old], "Inactive")).toEqual([
      { value: "00000001", code: "00000001", name: "Main warehouse" },
      { value: "00000002", code: "00000002", name: "Old yard", detail: "Inactive" },
    ]);
  });

  it("offers only active records to a new entry (MAT-029, LFC-019)", () => {
    expect(activeRecordOptions([main, old])).toEqual([{ value: "00000001", code: "00000001", name: "Main warehouse" }]);
  });

  it("keeps the value an edit already holds, marked when it is inactive", () => {
    expect(activeRecordOptions([main, old], { keep: "00000002", inactive: "Inactive" })).toEqual([
      { value: "00000001", code: "00000001", name: "Main warehouse" },
      { value: "00000002", code: "00000002", name: "Old yard", detail: "Inactive" },
    ]);
  });

  it("speaks each kind's words, in the reader's language, as plain strings", () => {
    expect(recordPicker(en.lists, "customer").labels.refused).toBe("Choose a customer from the list.");
    expect(recordPicker(en.lists, "supplier").labels.noMatch).toBe("No supplier matches “{text}”.");
    const location = recordPicker(pl.lists, "location");
    expect(location).toEqual({
      placeholder: "Wpisz ID albo nazwę",
      labels: {
        results: { one: "{count} lokalizacja", few: "{count} lokalizacje", other: "{count} lokalizacji" },
        noMatch: "Żadna lokalizacja nie pasuje do „{text}”.",
        more: { other: "Jeszcze {count}: pisz dalej, aby zawęzić listę" },
        refused: "Wybierz lokalizację z listy.",
      },
    });
    expect(Object.values(location.labels).some((value) => typeof value === "function")).toBe(false);
  });
});
