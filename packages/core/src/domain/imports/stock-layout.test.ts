import { describe, expect, it } from "vitest";
import { CORRECTION_TRANSIT_MESSAGE } from "../../validators/stock/stock-correction.schema";
import { STOCK_IMPORT_RULES, STOCK_LAYOUT, STOCK_SHEET, TRANSIT_COLUMN_HEADERS } from "./stock-layout";

describe("the stock workbook layout", () => {
  it("has one Stock sheet: material, location, the desired physical quantity and its unit (STX-001)", () => {
    expect(STOCK_LAYOUT.sheets).toEqual([STOCK_SHEET]);
    expect(STOCK_SHEET.name).toBe("Stock");
    expect(STOCK_SHEET.columns.map((column) => [column.header, column.field, column.kind, column.required])).toEqual([
      ["Material ID", "material", "id", "always"],
      ["Location ID", "location", "id", "always"],
      ["Physical quantity", "quantity", "text", "always"],
      ["Unit", "unit", "text", "never"],
    ]);
    for (const column of STOCK_SHEET.columns) {
      expect(column.example).not.toBe("");
      expect(column.meaning.en).not.toBe("");
      expect(column.meaning.pl).not.toBe("");
    }
    expect(STOCK_SHEET.purpose.en).toMatch(/should have.*not a change/);
  });

  it("explains that the unit is a physical one, never SU, in both languages (#243)", () => {
    const unit = STOCK_SHEET.columns.find((column) => column.field === "unit")!;
    expect(unit.meaning.en).toBe("The material's base unit or a physical unit it converts (not SU). Blank: its base unit.");
    expect(unit.meaning.pl).toContain("(nie SU)");
  });

  it("refuses the transit columns with the manual correction's message (STX-020, TRF-014)", () => {
    expect(STOCK_SHEET.refusedColumns).toEqual([{ headers: TRANSIT_COLUMN_HEADERS, code: "IMPORT_TRANSIT_COLUMN", message: CORRECTION_TRANSIT_MESSAGE }]);
    expect(TRANSIT_COLUMN_HEADERS).toEqual(["Transfer", "Transfer ID", "In transit", "In-transit"]);
  });

  it("explains desired balances, untouched positions, transit, the reason at commit and the limits, in both languages", () => {
    const english = STOCK_IMPORT_RULES.map((rule) => rule.en).join(" ");
    expect(english).toMatch(/not the change/);
    expect(english).toMatch(/leave out are untouched/);
    expect(english).toMatch(/write it off on the transfer/);
    expect(english).toMatch(/one reason.*"Opening balance"/);
    expect(english).toMatch(/2000 rows and 512 KB/);
    for (const rule of STOCK_IMPORT_RULES) expect(rule.pl).not.toBe("");
    expect(STOCK_LAYOUT.rules).toBe(STOCK_IMPORT_RULES);
    expect(STOCK_LAYOUT.title).toEqual({ en: "CPG stock import template", pl: "Szablon importu stanów CPG" });
  });
});
