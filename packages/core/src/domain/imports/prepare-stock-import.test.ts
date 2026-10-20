import { describe, expect, it } from "vitest";
import { UNIT_FORMAT_MESSAGE } from "../../validators/materials/material-fields.schema";
import { LOCATION_CHOICE_MESSAGE, MATERIAL_CHOICE_MESSAGE } from "../../validators/planning-parameters/planning-parameter-fields.schema";
import { QUANTITY_MESSAGE } from "../../validators/quantities/quantity.schema";
import { CORRECTION_TRANSIT_MESSAGE } from "../../validators/stock/stock-correction.schema";
import type { Cell, WorkbookSheet } from "./cells";
import { prepareStockImport } from "./prepare-stock-import";

const HEADERS = ["Material ID", "Location ID", "Physical quantity", "Unit"];
const stock = (...rows: Cell[][]): WorkbookSheet => ({ name: "Stock", rows: [HEADERS, ...rows] });
const problems = (workbook: WorkbookSheet[]) => prepareStockImport(workbook).errors.map((error) => [error.row, error.column, error.code, error.message]);

describe("prepareStockImport", () => {
  it("reads each position's desired quantity, normalizing IDs, numbers and a blank unit", () => {
    const result = prepareStockImport([
      { name: "Instructions", rows: [["anything"]] },
      stock([1, "00000002", 85, null], [], ["2", 1, "2.5", " case "], ["00000003", "00000001", 0, "kg"]),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.hasStockSheet).toBe(true);
    expect(result.rows).toEqual([
      { row: 2, values: { material: "00000001", location: "00000002", quantity: "85.000000", unit: null } },
      { row: 4, values: { material: "00000002", location: "00000001", quantity: "2.500000", unit: "case" } },
      { row: 5, values: { material: "00000003", location: "00000001", quantity: "0.000000", unit: "kg" } },
    ]);
    expect(result.cells.map(({ sheet, row }) => [sheet, row])).toEqual([
      ["Stock", 2],
      ["Stock", 4],
      ["Stock", 5],
    ]);
  });

  it("refuses a negative or malformed quantity, bad IDs and a bad unit, on their columns (STX-010)", () => {
    expect(problems([stock([1, 1, -1, null], ["A1", null, "1.0000001", "%%"])])).toEqual([
      [2, "Physical quantity", "VALIDATION_FAILED", QUANTITY_MESSAGE],
      [3, "Material ID", "VALIDATION_FAILED", MATERIAL_CHOICE_MESSAGE],
      [3, "Location ID", "VALIDATION_FAILED", LOCATION_CHOICE_MESSAGE],
      [3, "Physical quantity", "VALIDATION_FAILED", QUANTITY_MESSAGE],
      [3, "Unit", "VALIDATION_FAILED", UNIT_FORMAT_MESSAGE],
    ]);
  });

  it("refuses every row of a position listed twice, whatever its unit (STX-013)", () => {
    const result = prepareStockImport([stock([1, 2, 10, null], [1, 3, 5, null], [1, 2, 1, "case"])]);
    expect(result.rows.map(({ row }) => row)).toEqual([3]);
    expect(result.errors).toEqual(
      [2, 4].map((row) => ({
        sheet: "Stock",
        row,
        column: "Location ID",
        code: "IMPORT_DUPLICATE_KEY",
        message: "The position 00000001/00000002 appears on rows 2 and 4: keep one row per material and location.",
        params: { key: "00000001/00000002", rows: "2, 4" },
      })),
    );
  });

  it("refuses a transit column with the transfer write-off advice, and any other unknown column (STX-020)", () => {
    const result = prepareStockImport([{ name: "stock", rows: [[...HEADERS, "In transit", "Note"], [1, 1, 5, null, 10, "x"]] }]);
    expect(result.errors).toEqual([
      { sheet: "Stock", row: 1, column: "In transit", code: "IMPORT_TRANSIT_COLUMN", message: CORRECTION_TRANSIT_MESSAGE, params: { column: "In transit" } },
      {
        sheet: "Stock",
        row: 1,
        column: "Note",
        code: "IMPORT_UNKNOWN_COLUMN",
        message: 'The column "Note" isn\'t part of this sheet. Rename or remove it.',
        params: { column: "Note" },
      },
    ]);
    expect(result.rows).toEqual([]);
    expect(result.hasStockSheet).toBe(false);
    for (const header of ["TRANSFER", "transfer id", "In-Transit"]) {
      expect(prepareStockImport([{ name: "Stock", rows: [[...HEADERS, header]] }]).errors.map((error) => error.code)).toEqual(["IMPORT_TRANSIT_COLUMN"]);
    }
  });

  it("reports a missing column, a master-data sheet, and an empty workbook", () => {
    expect(problems([{ name: "Stock", rows: [["Material ID", "Location ID", "Unit"], [1, 1, null]] }])).toEqual([
      [1, "Physical quantity", "IMPORT_MISSING_COLUMN", 'The sheet has no "Physical quantity" column. Keep the template\'s header row.'],
    ]);
    expect(problems([{ name: "Materials", rows: [["ID"]] }])).toEqual([
      [1, null, "IMPORT_UNKNOWN_SHEET", 'The sheet "Materials" isn\'t part of the template. Rename or remove it.'],
    ]);
    const empty = prepareStockImport([stock(), { name: "Instrukcja", rows: [] }]);
    expect(empty.errors).toEqual([{ sheet: null, row: null, column: null, code: "IMPORT_EMPTY", message: "The workbook has no rows to import." }]);
    expect(empty.hasStockSheet).toBe(true);
  });
});
