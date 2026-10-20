import { describe, expect, it } from "vitest";
import { COMPONENT_COUNT_MESSAGE, OUTPUT_CHOICE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import { ACTIVE_MESSAGE, ID_FORMAT_MESSAGE, REFERENCE_FORMAT_MESSAGE } from "../../validators/imports/import-rows.schema";
import { TYPE_MESSAGE } from "../../validators/materials/material-fields.schema";
import type { Cell, WorkbookSheet } from "./cells";
import { prepareImport } from "./prepare-import";
import { sheetSpec, type SheetKey } from "./workbook-layout";

/** A sheet with the template's header row and the given data rows. */
const sheet = (key: SheetKey, ...rows: Cell[][]): WorkbookSheet => ({
  name: sheetSpec(key).name,
  rows: [sheetSpec(key).columns.map((column) => column.header), ...rows],
});

const codes = (workbook: WorkbookSheet[]) => prepareImport(workbook).errors.map((error) => [error.sheet, error.row, error.column, error.code]);

describe("prepareImport — layout", () => {
  it("skips instruction sheets and blank sheets, and needs at least one data row", () => {
    const result = prepareImport([
      { name: "Instructions", rows: [["anything"]] },
      { name: "Instrukcja", rows: [] },
      { name: "Materials", rows: [] },
      { name: "Locations", rows: [[null, "  "]] },
    ]);
    expect(result.errors).toEqual([{ sheet: null, row: null, column: null, code: "IMPORT_EMPTY", message: "The workbook has no rows to import." }]);
    expect(result.sheets).toEqual(["materials", "locations"]);
  });

  it("reports a sheet that isn't in the template", () => {
    expect(prepareImport([{ name: " Notes ", rows: [["x"]] }]).errors).toEqual([
      {
        sheet: "Notes",
        row: 1,
        column: null,
        code: "IMPORT_UNKNOWN_SHEET",
        message: 'The sheet "Notes" isn\'t part of the template. Rename or remove it.',
        params: { sheet: "Notes" },
      },
    ]);
  });

  it("reports missing and unknown columns and skips that sheet's rows", () => {
    const result = prepareImport([
      { name: "Materials", rows: [["id", "TYPE", "Description", "Colour"], [null, "nope", "", ""]] },
    ]);
    expect(result.errors.map((error) => [error.code, error.column])).toEqual([
      ["IMPORT_MISSING_COLUMN", "Base unit"],
      ["IMPORT_MISSING_COLUMN", "Active"],
      ["IMPORT_UNKNOWN_COLUMN", "Colour"],
    ]);
    expect(result.materials).toEqual([]);
    expect(result.cells).toEqual([]);
  });

  it("matches headers in any case and order, ignores unnamed columns, and skips blank rows, keeping the sheet's row numbers", () => {
    const result = prepareImport([
      {
        name: "materials",
        rows: [["active", "base unit", "description", "type", "ID", null], [], [null, "kg", "Steel", "RAW", null, "note"], ["no", "each", "Bolt", "raw", 2]],
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.materials).toEqual([
      { row: 3, values: { id: null, type: "raw", description: "Steel", baseUnit: "kg", active: null } },
      { row: 4, values: { id: "00000002", type: "raw", description: "Bolt", baseUnit: "each", active: false } },
    ]);
    expect(result.cells.map(({ sheet: name, row }) => [name, row])).toEqual([
      ["Materials", 3],
      ["Materials", 4],
    ]);
  });

  it("applies the template's order whatever the tab order (XLS-008)", () => {
    const result = prepareImport([sheet("locations", [null, "Cave"]), sheet("materials", [null, "raw", "Steel", "kg", null])]);
    expect(result.sheets).toEqual(["materials", "locations"]);
    expect(result.cells.map((cell) => cell.sheet)).toEqual(["Materials", "Locations"]);
  });
});

describe("prepareImport — cells", () => {
  it("reports each invalid field once, on its column (XLS-006)", () => {
    const result = prepareImport([sheet("materials", ["A1", null, "Steel", "kg", "maybe"])]);
    expect(result.errors.map((error) => [error.row, error.column, error.code, error.message])).toEqual([
      [2, "ID", "VALIDATION_FAILED", ID_FORMAT_MESSAGE],
      [2, "Type", "VALIDATION_FAILED", TYPE_MESSAGE],
      [2, "Active", "VALIDATION_FAILED", ACTIVE_MESSAGE],
    ]);
    expect(result.materials).toEqual([]);
  });

  it("refuses a new record marked inactive (spec Q3)", () => {
    expect(codes([sheet("materials", [null, "raw", "Steel", "kg", "no"]), sheet("locations", [null, "Cave", false])])).toEqual([
      ["Materials", 2, "Active", "IMPORT_NEW_RECORD_INACTIVE"],
      ["Locations", 2, "Active", "IMPORT_NEW_RECORD_INACTIVE"],
    ]);
  });

  it("reads every master sheet into its service's input", () => {
    const result = prepareImport([
      sheet("unitConversions", [2, "case", 12, "1"]),
      sheet("customers", [null, "Stone Age Retail", null]),
      sheet("suppliers", [7, "Flint & Co", "yes"]),
      sheet("planningParameters", [1, 1, "BUY", 5, "0", 1]),
      sheet("safetyStock", [1, 1, new Date(Date.UTC(2027, 0, 1)), 100]),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.unitConversions[0].values).toEqual({ material: "00000002", unit: "case", numerator: "12", denominator: "1" });
    expect(result.customers[0].values).toEqual({ id: null, name: "Stone Age Retail", active: null });
    expect(result.suppliers[0].values).toEqual({ id: "00000007", name: "Flint & Co", active: true });
    expect(result.planningParameters[0].values).toEqual({
      material: "00000001",
      location: "00000001",
      procurement: "buy",
      leadTimeDays: 5,
      minimumQuantity: "0.000000",
      lotMultiple: "1.000000",
    });
    expect(result.safetyStock[0].values).toEqual({ material: "00000001", location: "00000001", effectiveFrom: "2027-01-01", quantity: "100.000000" });
  });
});

describe("prepareImport — duplicate keys (XLS-005)", () => {
  it("drops every copy of a duplicated ID and names the rows on each", () => {
    const result = prepareImport([
      sheet("materials", [1, "raw", "A", "kg", null], [null, "raw", "B", "kg", null], [1, "raw", "C", "kg", null], [null, "raw", "D", "kg", null], ["1", "raw", "E", "kg", null]),
    ]);
    const message = "Material 00000001 appears on rows 2, 4 and 6: keep one row per material.";
    expect(result.errors).toEqual(
      [2, 4, 6].map((row) => ({ sheet: "Materials", row, column: "ID", code: "IMPORT_DUPLICATE_KEY", message, params: { key: "00000001", rows: "2, 4 and 6" } })),
    );
    expect(result.materials.map((row) => row.values.description)).toEqual(["B", "D"]);
  });

  it("keys conversions, planning sets, safety targets and named records by their own keys", () => {
    expect(
      codes([
        sheet("unitConversions", [2, "case", 12, 1], [2, "case", 10, 1], [2, "box", 6, 1]),
        sheet("locations", [3, "A", null], [3, "B", null]),
        sheet("planningParameters", [1, 1, "buy", 1, 0, 1], [1, 1, "buy", 2, 0, 1]),
        sheet("safetyStock", [1, 1, "2027-01-01", 1], [1, 1, "2027-01-01", 2], [1, 1, "2027-02-01", 2]),
      ]),
    ).toEqual([
      ["Unit conversions", 2, "Unit", "IMPORT_DUPLICATE_KEY"],
      ["Unit conversions", 3, "Unit", "IMPORT_DUPLICATE_KEY"],
      ["Locations", 2, "ID", "IMPORT_DUPLICATE_KEY"],
      ["Locations", 3, "ID", "IMPORT_DUPLICATE_KEY"],
      ["Planning parameters", 2, "Location ID", "IMPORT_DUPLICATE_KEY"],
      ["Planning parameters", 3, "Location ID", "IMPORT_DUPLICATE_KEY"],
      ["Safety stock", 2, "Effective from", "IMPORT_DUPLICATE_KEY"],
      ["Safety stock", 3, "Effective from", "IMPORT_DUPLICATE_KEY"],
    ]);
  });
});

describe("prepareImport — BOMs (spec Q8)", () => {
  const header = (id: Cell, reference: Cell, output: Cell = 5, active: Cell = null): Cell[] => [id, reference, output, 1, "2027-01-01", null, active];

  it("groups each header's lines, by import reference or BOM ID, in sheet order (XLS-018, XLS-019)", () => {
    const result = prepareImport([
      sheet("bomHeaders", header(null, "RECIPE-A"), header(null, "RECIPE-B"), header(2, null, null)),
      sheet("bomLines", ["RECIPE-A", 1, 4.5, null], ["RECIPE-B", 3, "250", "ml"], [2, 4, 2, "each"], ["RECIPE-A", 3, "0.25", "l"]),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.boms.map((bom) => [bom.row, bom.values.reference, bom.values.id, bom.lines.map((line) => line.row)])).toEqual([
      [2, "RECIPE-A", null, [2, 5]],
      [3, "RECIPE-B", null, [3]],
      [4, null, "00000002", [4]],
    ]);
    expect(result.boms[0].values).toEqual({
      id: null,
      reference: "RECIPE-A",
      output: "00000005",
      priority: 1,
      validFrom: "2027-01-01",
      validThrough: null,
      active: null,
    });
    expect(result.boms[0].lines[0].values).toEqual({ bom: { kind: "reference", reference: "RECIPE-A" }, material: "00000001", quantity: "4.5", unit: null });
  });

  it("needs an import reference and an output for a new BOM, and a letter in every reference", () => {
    expect(
      codes([
        sheet("bomHeaders", header(null, null), header(null, "R1", null), header(null, "12345", 5)),
        sheet("bomLines", ["R1", 1, 1, null]),
      ]),
    ).toEqual([
      // The cell pass runs first; the report sorts every error by sheet and row.
      ["BOM headers", 4, "Import reference", "VALIDATION_FAILED"],
      ["BOM headers", 2, "Import reference", "IMPORT_REFERENCE_REQUIRED"],
      ["BOM headers", 3, "Output material ID", "VALIDATION_FAILED"],
    ]);
    const messages = prepareImport([sheet("bomHeaders", header(null, "R1", null), header(null, "12345"))]).errors.map((e) => e.message);
    expect(messages).toEqual([REFERENCE_FORMAT_MESSAGE, OUTPUT_CHOICE_MESSAGE]);
  });

  it("reports a cell that breaks two rules once", () => {
    const tooLong = "1".repeat(41);
    expect(prepareImport([sheet("bomHeaders", header(null, tooLong))]).errors).toEqual([
      { sheet: "BOM headers", row: 2, column: "Import reference", code: "VALIDATION_FAILED", message: REFERENCE_FORMAT_MESSAGE },
    ]);
  });

  it("refuses a new BOM marked inactive, and duplicate IDs and references", () => {
    expect(
      codes([
        sheet("bomHeaders", header(null, "R1", 5, "no"), header(2, null, null), header(2, null, null), header(null, "R2"), header(null, "R2")),
        sheet("bomLines", [2, 1, 1, null], ["R2", 1, 1, null]),
      ]),
    ).toEqual([
      ["BOM headers", 2, "Active", "IMPORT_NEW_RECORD_INACTIVE"],
      ["BOM headers", 3, "BOM ID", "IMPORT_DUPLICATE_KEY"],
      ["BOM headers", 4, "BOM ID", "IMPORT_DUPLICATE_KEY"],
      ["BOM headers", 5, "Import reference", "IMPORT_DUPLICATE_KEY"],
      ["BOM headers", 6, "Import reference", "IMPORT_DUPLICATE_KEY"],
    ]);
  });

  it("reports lines without a header and headers without lines", () => {
    const result = prepareImport([
      sheet("bomHeaders", header(null, "R1"), header(3, null, null)),
      sheet("bomLines", [4, 1, 1, null], ["R9", 1, 1, null], [3, 1, 1, null]),
    ]);
    expect(result.errors.map((error) => [error.sheet, error.row, error.column, error.code, error.message])).toEqual([
      ["BOM lines", 2, "BOM", "IMPORT_LINE_WITHOUT_HEADER", "BOM 00000004 has no row on the BOM headers sheet. Add its header: a BOM's lines are its complete recipe."],
      ["BOM lines", 3, "BOM", "IMPORT_LINE_WITHOUT_HEADER", "No row on the BOM headers sheet has the import reference R9."],
      ["BOM headers", 2, null, "IMPORT_BOM_WITHOUT_LINES", "This BOM has no rows on the BOM lines sheet: list its complete recipe there."],
    ]);
    expect(result.boms.map((bom) => bom.values.id)).toEqual(["00000003"]);
  });

  it("leaves out a header whose line failed, and the lines of a header that failed, without more errors", () => {
    const result = prepareImport([
      sheet("bomHeaders", header(null, "R1"), [null, "R2", 5, "x", "2027-01-01", null, null]),
      sheet("bomLines", ["R1", 1, 1, null], ["R1", 2, -1, null], ["R2", 1, 1, null], [null, 1, 1, null]),
    ]);
    expect(result.errors.map((error) => [error.sheet, error.row, error.column])).toEqual([
      ["BOM headers", 3, "Priority"],
      ["BOM lines", 3, "Quantity"],
      ["BOM lines", 5, "BOM"],
    ]);
    expect(result.boms).toEqual([]);
  });

  it("refuses a recipe of more than 100 lines", () => {
    const lines = Array.from({ length: 101 }, (_, index): Cell[] => ["R1", index + 1, 1, null]);
    const result = prepareImport([sheet("bomHeaders", header(null, "R1")), sheet("bomLines", ...lines)]);
    expect(result.errors).toEqual([{ sheet: "BOM headers", row: 2, column: null, code: "VALIDATION_FAILED", message: COMPONENT_COUNT_MESSAGE }]);
    expect(result.boms).toEqual([]);
  });
});
