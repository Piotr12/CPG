import { describe, expect, it } from "vitest";
import { ID_FORMAT_MESSAGE } from "@cpg/core/validators/imports/import-rows.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { importLabels } from "./labels";
import { changeText, counted, createdText, problemText } from "./report-text";

const issue = (code: string, message: string, params?: Record<string, string | number>) => ({ sheet: "Materials", row: 2, column: "ID", code, message, params });

describe("problemText", () => {
  it("fills the import's own codes from their params, in the reader's language", () => {
    expect(problemText(issue("IMPORT_UNKNOWN_ID", "x", { id: "00009876", record: "material" }), importLabels(pl), "Test")).toBe(
      "Materiał 00009876 nie istnieje w Test. Zostaw ID puste, aby utworzyć nowy rekord.",
    );
    expect(problemText(issue("IMPORT_DUPLICATE_KEY", "x", { key: "00000001", rows: "2, 4" }), importLabels(en), "Prod")).toBe(
      "00000001 appears on rows 2, 4: keep one row for it.",
    );
    expect(problemText(issue("IMPORT_UNKNOWN_ID", "x", { id: "1", record: "gadget" }), importLabels(en), "Prod")).toMatch(/^gadget 1 doesn't exist in Prod/);
    expect(problemText(issue("IMPORT_EMPTY", "x"), importLabels(en), "Prod")).toBe("The workbook has no rows to import.");
  });

  it("translates a cell's message, or keeps an unknown one", () => {
    expect(problemText(issue("VALIDATION_FAILED", ID_FORMAT_MESSAGE), importLabels(pl), "Test")).toBe(pl.imports.fieldErrors.id);
    expect(problemText(issue("VALIDATION_FAILED", "Something else."), importLabels(pl), "Test")).toBe("Something else.");
  });

  it("translates a service's refusal by code, with a cycle's path", () => {
    const cycle = issue("BOM_CYCLE", "This BOM would make a cycle: 00000004 Panel →(BOM 00000001) 00000004 Panel.");
    expect(problemText(cycle, importLabels(en), "Prod")).toBe(`${en.boms.errors.BOM_CYCLE} 00000004 Panel →(BOM 00000001) 00000004 Panel.`);
    expect(problemText(issue("SOMETHING_NEW", "As the server says."), importLabels(en), "Prod")).toBe("As the server says.");
  });
  it.each([en, pl])("keeps exact stock context in a localized service refusal", (messages) => {
    const text = problemText(issue("STOCK_NOT_EMPTY", "English server context.", { material: "00000001", location: "00000002", quantity: "2.000001", unit: "kg", count: 2 }), importLabels(messages), "Prod");
    expect(text).toBe(messages === en
      ? "Material 00000001 at location 00000002 holds 2.000001 kg. Clear its stock before deactivation."
      : "Materiał 00000001 w lokalizacji 00000002 ma zapas 2.000001 kg. Wyzeruj zapas przed dezaktywacją.");
    expect(problemText(issue("STOCK_NOT_EMPTY", "English.", { material: "00000001", location: "00000002", quantity: 2, unit: "kg" }), importLabels(messages), "Prod")).toContain("2 kg");
    expect(problemText(issue("STOCK_NOT_EMPTY", "Original exact context."), importLabels(messages), "Prod")).toBe("Original exact context.");
  });

});

describe("changeText and createdText", () => {
  const labels = importLabels(en);

  it("writes a change, a flag, a blank value and a component added or removed", () => {
    expect(changeText({ field: "Description", before: "Steel", after: "Steel 2 mm" }, labels)).toBe("Description: Steel → Steel 2 mm");
    expect(changeText({ field: "Active", before: true, after: false }, labels)).toBe("Active: yes → no");
    expect(changeText({ field: "Valid through", before: "2027-12-31", after: null }, labels)).toBe("Valid through: 2027-12-31 → —");
    expect(changeText({ field: "Component 00000002", before: null, after: "1.000000 each" }, labels)).toBe("Component 00000002: added → 1.000000 each");
    expect(changeText({ field: "Component 00000002", before: "16.000000 each", after: null }, labels)).toBe("Component 00000002: 16.000000 each → removed");
  });

  it("writes a new record's values on one line", () => {
    expect(
      createdText(
        [
          { field: "Type", before: null, after: "raw" },
          { field: "Valid through", before: null, after: null },
          { field: "Active", before: null, after: true },
          { field: "Component 00000001", before: null, after: "4.500000 kg" },
        ],
        labels,
      ),
    ).toBe("raw · yes · 00000001 4.500000 kg");
  });
});

describe("counted", () => {
  it("picks the form for the count in each language", () => {
    expect([1, 2].map((count) => counted(en.imports.commit.button, count))).toEqual(["Commit 1 change", "Commit 2 changes"]);
    expect([1, 3].map((count) => counted(pl.imports.preview.showUnchanged, count))).toEqual(["Pokaż 1 wiersz bez zmian", "Pokaż wiersze bez zmian (3)"]);
    expect(counted(en.imports.commit.text, 1, { tenant: "Test" })).toMatch(/^The change is written to Test in one transaction/);
    expect(counted(pl.imports.upload.problems, 4)).toMatch(/^Znalezione problemy: 4\./);
  });
});
