import type { z } from "zod";
import { cellText, isBlank, normalizeCell, type CellValue, type WorkbookSheet, type WorkbookSheets } from "./cells";
import { isInstructionSheet, layoutSheetNamed, type ImportLayout, type SheetSpec } from "./workbook-layout";

/*
 * The database-free passes every import runs on a workbook, whatever its layout (stock-import spec
 * Q1): the layout check, the cell pass and the duplicate-key pass. The master-data import
 * (`prepare-import.ts`) and the stock import (`prepare-stock-import.ts`) add their own passes on top.
 */

/**
 * One problem the import found, placed by sheet, row (the sheet's own number, header = 1) and column
 * where it has them (spec `2026-10-20--0908UTC-master-data-bom-import`, API Contracts). `params`
 * carries language-neutral values a screen can put in its own translation.
 */
export interface ImportIssue {
  sheet: string | null;
  row: number | null;
  column: string | null;
  code: string;
  message: string;
  params?: Record<string, string | number>;
}

/** A data row that passed the cell and key passes: its row number and its parsed values. */
export interface SheetRow<T> {
  row: number;
  values: T;
}

/** A normalized data row, kept for the preview token whether or not it passed. */
export interface NormalizedRow {
  sheet: string;
  row: number;
  values: Record<string, CellValue>;
}

export type Values = Record<string, CellValue>;

/** What the layout check makes of a workbook: each data sheet's normalized rows, in the layout's order. */
export interface ReadSheets<K extends string> {
  /** The normalized rows of each data sheet whose header row matched. */
  rows: Map<K, SheetRow<Values>[]>;
  /** The data sheets the workbook has, in the layout's order. */
  sheets: K[];
  /** Every normalized data row, in sheet and row order: the preview token's "cells". */
  cells: NormalizedRow[];
}

export function issue(
  sheet: string | null,
  row: number | null,
  column: string | null,
  code: string,
  message: string,
  params?: ImportIssue["params"],
): ImportIssue {
  return params ? { sheet, row, column, code, message, params } : { sheet, row, column, code, message };
}

/**
 * The layout check and cell normalization (spec Q10): every tab is a sheet of `layout`, once, with
 * the template's header row, or an error. Instruction sheets are skipped. The tab order doesn't
 * matter: the layout's order is kept. A workbook with no data row at all is `IMPORT_EMPTY`.
 */
export function readSheets<K extends string>(layout: ImportLayout<K>, workbook: WorkbookSheets, errors: ImportIssue[]): ReadSheets<K> {
  const found = new Map<K, SheetRow<Values>[]>();
  const seen = new Set<K>();
  for (const sheet of workbook) {
    if (isInstructionSheet(sheet.name)) continue;
    const spec = layoutSheetNamed(layout, sheet.name);
    if (!spec) {
      const name = sheet.name.trim();
      errors.push(
        issue(name, 1, null, "IMPORT_UNKNOWN_SHEET", `The sheet "${name}" isn't part of the template. Rename or remove it.`, {
          sheet: name,
        }),
      );
      continue;
    }
    if (seen.has(spec.key)) {
      // Two tabs whose names differ only in case or spaces: neither may silently replace the other.
      const name = sheet.name.trim();
      errors.push(issue(name, 1, null, "IMPORT_DUPLICATE_SHEET", `The workbook has another "${spec.name}" sheet. Keep one.`, { sheet: name }));
      continue;
    }
    seen.add(spec.key);
    const rows = readRows(spec, sheet, errors);
    if (rows) found.set(spec.key, rows);
  }

  const sheets = layout.sheets.map(({ key }) => key).filter((key) => found.has(key));
  const cells = sheets.flatMap((key) => {
    const name = layout.sheets.find((sheet) => sheet.key === key)!.name;
    return found.get(key)!.map(({ row, values }) => ({ sheet: name, row, values }));
  });
  if (cells.length === 0 && errors.length === 0) {
    errors.push(issue(null, null, null, "IMPORT_EMPTY", "The workbook has no rows to import."));
  }
  return { rows: found, sheets, cells };
}

/**
 * A sheet's data rows, normalized by column (Q9), or null when its header row doesn't match the
 * template: every column must be there, and no other. A refused column gets its own explanation.
 * Blank rows are skipped; a sheet with no non-blank row at all is simply empty.
 */
function readRows(spec: SheetSpec<string>, sheet: WorkbookSheet, errors: ImportIssue[]): SheetRow<Values>[] | null {
  if (sheet.rows.every((row) => row.every(isBlank))) return [];
  // Not every row is blank, so there is a first row.
  const headers = sheet.rows[0].map((cell) => cellText(cell)?.toLowerCase() ?? null);
  const indexes = spec.columns.map((column) => headers.indexOf(column.header.toLowerCase()));
  let matches = true;
  spec.columns.forEach((column, position) => {
    if (indexes[position] >= 0) return;
    matches = false;
    const message = `The sheet has no "${column.header}" column. Keep the template's header row.`;
    errors.push(
      issue(spec.name, 1, column.header, "IMPORT_MISSING_COLUMN", message, {
        column: column.header,
      }),
    );
  });
  headers.forEach((header, position) => {
    if (header === null || indexes.includes(position)) return;
    matches = false;
    const name = cellText(sheet.rows[0][position])!;
    const refused = spec.refusedColumns?.find((column) => column.headers.some((each) => each.toLowerCase() === header));
    if (refused) {
      errors.push(issue(spec.name, 1, name, refused.code, refused.message, { column: name }));
      return;
    }
    const message = `The column "${name}" isn't part of this sheet. Rename or remove it.`;
    errors.push(
      issue(spec.name, 1, name, "IMPORT_UNKNOWN_COLUMN", message, {
        column: name,
      }),
    );
  });
  if (!matches) return null;
  return sheet.rows.slice(1).flatMap((row, index) => {
    if (row.every(isBlank)) return [];
    const values = Object.fromEntries(
      spec.columns.map((column, position) => [column.field, normalizeCell(column.kind, row[indexes[position]])]),
    );
    return [{ row: index + 2, values }];
  });
}

/** The rows that pass the sheet's schema; each failing field becomes an error on its column. */
export function parseRows<S extends z.ZodType>(spec: SheetSpec<string>, schema: S, rows: SheetRow<Values>[], errors: ImportIssue[]): SheetRow<z.infer<S>>[] {
  return rows.flatMap(({ row, values }) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return [{ row, values: parsed.data }];
    const seen = new Set<string>();
    for (const { path, message } of parsed.error.issues) {
      // Every schema is an object of the sheet's fields, so every issue names one.
      const field = String(path[0]);
      if (seen.has(field)) continue;
      seen.add(field);
      const column = spec.columns.find((each) => each.field === field)!.header;
      errors.push(issue(spec.name, row, column, "VALIDATION_FAILED", message));
    }
    return [];
  });
}

/** How a duplicate key is reported: the column it is shown on, and the sentence naming the rows. */
export interface DuplicateReport {
  column: string;
  message: (key: string, rows: string) => string;
}

/**
 * Drops every row whose key another row of the sheet also has, with an error on each naming the
 * rows (XLS-005, spec Q5). Rows without a key (a blank ID: a new record) are never duplicates.
 */
export function unique<T>(
  spec: SheetSpec<string>,
  rows: SheetRow<T>[],
  keyOf: (values: T) => string | null,
  report: DuplicateReport,
  errors: ImportIssue[],
): SheetRow<T>[] {
  const groups = new Map<string, number[]>();
  for (const { row, values } of rows) {
    const value = keyOf(values);
    if (value !== null) groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  const duplicated = new Set<number>();
  for (const [value, numbers] of groups) {
    if (numbers.length < 2) continue;
    const list = `${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
    for (const row of numbers) {
      duplicated.add(row);
      // `rows` is language-neutral for a screen's own sentence: "2, 4, 6".
      errors.push(issue(spec.name, row, report.column, "IMPORT_DUPLICATE_KEY", report.message(value, list), { key: value, rows: numbers.join(", ") }));
    }
  }
  return rows.filter(({ row }) => !duplicated.has(row));
}
