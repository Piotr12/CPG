import { describe, expect, it } from "vitest";
import {
  columnHeader,
  IMPORT_RULES,
  IMPORT_SHEETS,
  isInstructionSheet,
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

  it("documents blank, known and unknown IDs, the import reference and the full recipe (XLS-001, XLS-017)", () => {
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
    expect(headers.purpose.en).toMatch(/complete recipe/);
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

  it("names a column by its field", () => {
    expect(columnHeader("materials", "baseUnit")).toBe("Base unit");
    expect(columnHeader("bomLines", "material")).toBe("Component material ID");
    expect(columnHeader("materials", "unknown")).toBeNull();
  });
});
