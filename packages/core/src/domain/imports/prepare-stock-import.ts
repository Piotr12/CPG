import { stockRowSchema, type StockRow } from "../../validators/imports/import-rows.schema";
import type { WorkbookSheets } from "./cells";
import { parseRows, readSheets, unique, type ImportIssue, type NormalizedRow, type SheetRow } from "./read-sheets";
import { STOCK_LAYOUT, STOCK_SHEET } from "./stock-layout";

/** What the database-free passes make of a stock workbook, ready for the read pass. */
export interface PreparedStockImport {
  /** The Stock rows that passed the cell and key passes, in row order. */
  rows: SheetRow<StockRow>[];
  /** Whether the workbook has a readable Stock sheet. */
  hasStockSheet: boolean;
  /** Every normalized data row: the token's "cells" (spec Q6). */
  cells: NormalizedRow[];
  errors: ImportIssue[];
}

/**
 * The stock workbook's layout check, cell pass and key pass (stock-import spec Q10): everything
 * that needs no database, so it runs before the write transaction opens. A position, a material at
 * a location, may appear once whatever its unit (STX-013).
 */
export function prepareStockImport(workbook: WorkbookSheets): PreparedStockImport {
  const errors: ImportIssue[] = [];
  const { rows, sheets, cells } = readSheets(STOCK_LAYOUT, workbook, errors);
  const parsed = parseRows(STOCK_SHEET, stockRowSchema, rows.get("stock") ?? [], errors);
  return {
    rows: unique(
      STOCK_SHEET,
      parsed,
      ({ material, location }) => `${material} at ${location}`,
      {
        column: "Location ID",
        message: (key, numbers) => `The position ${key} appears on rows ${numbers}: keep one row per material and location.`,
      },
      errors,
    ),
    hasStockSheet: sheets.length > 0,
    cells,
    errors,
  };
}
