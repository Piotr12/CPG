import { describe, expect, it } from "vitest";
import {
  columnHeader,
  IMPORT_RULES,
  IMPORT_SHEETS,
  isInstructionSheet,
  layoutSheetNamed,
  MASTER_DATA_LAYOUT,
  sheetNamed,
  sheetSpec,
} from "./workbook-layout";

describe("the import workbook layout", () => {
  it("lists the data sheets in their apply order (spec Q2)", () => {
    expect(IMPORT_SHEETS.map((sheet) => sheet.name)).toEqual([
      "Materials",
      "Unit conversions",
      "Locations",
      "Customers",
      "Suppliers",
      "Planning parameters",
      "Safety stock",
      "BOM headers",
      "BOM lines",
    ]);
  });

  it("gives every sheet unique headers and fields, each explained in both languages", () => {
    for (const sheet of IMPORT_SHEETS) {
      const headers = sheet.columns.map((column) => column.header.toLowerCase());
      expect(new Set(headers).size).toBe(headers.length);
      expect(new Set(sheet.columns.map((column) => column.field)).size).toBe(sheet.columns.length);
      expect(sheet.purpose.en).not.toBe("");
      expect(sheet.purpose.pl).not.toBe("");
      for (const column of sheet.columns) {
        expect(column.meaning.en).not.toBe("");
        expect(column.meaning.pl).not.toBe("");
      }
    }
  });

  it("says BOM, never recipe, in both languages of the Instructions prose and in the Example column (one term per concept, #206)", () => {
    const prose = IMPORT_SHEETS.flatMap((sheet) => [sheet.purpose.en, sheet.purpose.pl, ...sheet.columns.flatMap((column) => [column.meaning.en, column.meaning.pl, column.example])]);

    expect(prose.filter((text) => /recipe|receptur/i.test(text))).toEqual([]);
  });

  it("documents blank, known and unknown IDs, the import reference and the full component list (XLS-001, XLS-017)", () => {
    const materials = sheetSpec("materials");
    expect(materials.columns.map((column) => column.header)).toEqual(["ID", "Type", "Description", "Base unit", "Active"]);
    expect(materials.columns[0].meaning.en).toMatch(/Blank creates.*existing ID updates.*doesn't exist is an error/);
    const headers = sheetSpec("bomHeaders");
    expect(headers.columns.map((column) => column.header)).toEqual([
      "BOM ID",
      "Import reference",
      "Output material ID",
      "Priority",
      "Valid from",
      "Valid through",
      "Active",
    ]);
    expect(headers.purpose.en).toMatch(/all its components/);
    expect(sheetSpec("bomLines").columns.map((column) => column.header)).toEqual([
      "BOM",
      "Component material ID",
      "Quantity",
      "Unit",
    ]);
    expect(IMPORT_RULES.map((rule) => rule.en).join(" ")).toMatch(/dry run.*everything or nothing/);
  });

  it("finds sheets by tab name in any case, and recognizes the instruction sheets", () => {
    expect(sheetNamed(" bom LINES ")?.key).toBe("bomLines");
    expect(sheetNamed("Notes")).toBeUndefined();
    expect(isInstructionSheet("instructions")).toBe(true);
    expect(isInstructionSheet(" Instrukcja ")).toBe(true);
    expect(isInstructionSheet("Materials")).toBe(false);
  });

  it("explains that a BOM line's unit is a physical one, never SU, in both languages (#243)", () => {
    const unit = sheetSpec("bomLines").columns.find((column) => column.field === "unit")!;
    expect(unit.meaning.en).toBe("The component's base unit or a physical unit it converts (not SU). Blank: its base unit.");
    expect(unit.meaning.pl).toContain("(nie SU)");
  });

  it("names a column by its field", () => {
    expect(columnHeader("materials", "baseUnit")).toBe("Base unit");
    expect(columnHeader("bomLines", "material")).toBe("Component material ID");
    expect(columnHeader("materials", "unknown")).toBeNull();
  });

  it("is the master-data layout, and finds a sheet of any layout by its tab name", () => {
    expect(MASTER_DATA_LAYOUT).toEqual({ title: { en: "CPG import template", pl: "Szablon importu CPG" }, sheets: IMPORT_SHEETS, rules: IMPORT_RULES });
    expect(layoutSheetNamed(MASTER_DATA_LAYOUT, " materials")?.key).toBe("materials");
    const other = { title: { en: "", pl: "" }, sheets: [{ ...sheetSpec("materials"), key: "other", name: "Other" }], rules: [] };
    expect(layoutSheetNamed(other, "OTHER")?.key).toBe("other");
    expect(layoutSheetNamed(other, "Materials")).toBeUndefined();
  });
});
