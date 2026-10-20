import type { z } from "zod";
import { BOM_COMPONENTS_MAX } from "../boms/recipe-rules";
import { COMPONENT_COUNT_MESSAGE, OUTPUT_CHOICE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import {
  bomHeaderRowSchema,
  bomLineRowSchema,
  materialRowSchema,
  namedRecordRowSchema,
  planningParameterRowSchema,
  safetyStockRowSchema,
  unitConversionRowSchema,
  type BomHeaderRow,
  type BomLineRow,
  type MaterialRow,
  type NamedRecordRow,
  type PlanningParameterRow,
  type SafetyStockRow,
  type UnitConversionRow,
} from "../../validators/imports/import-rows.schema";
import { cellText, isBlank, normalizeCell, type BomTarget, type CellValue, type WorkbookSheet, type WorkbookSheets } from "./cells";
import { IMPORT_SHEETS, isInstructionSheet, sheetNamed, sheetSpec, type SheetKey, type SheetSpec } from "./workbook-layout";

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

/** A BOM header with its complete recipe: the BOM lines that name it, in sheet order. */
export interface PreparedBom extends SheetRow<BomHeaderRow> {
  lines: SheetRow<BomLineRow>[];
}

/** A normalized data row, kept for the preview token whether or not it passed. */
export interface NormalizedRow {
  sheet: string;
  row: number;
  values: Record<string, CellValue>;
}

/** What the database-free passes make of a workbook, ready for the apply pass. */
export interface PreparedImport {
  materials: SheetRow<MaterialRow>[];
  unitConversions: SheetRow<UnitConversionRow>[];
  locations: SheetRow<NamedRecordRow>[];
  customers: SheetRow<NamedRecordRow>[];
  suppliers: SheetRow<NamedRecordRow>[];
  planningParameters: SheetRow<PlanningParameterRow>[];
  safetyStock: SheetRow<SafetyStockRow>[];
  boms: PreparedBom[];
  /** The data sheets the workbook has, in apply order. */
  sheets: SheetKey[];
  /** Every normalized data row, in sheet and row order: the token's "cells" (Q7). */
  cells: NormalizedRow[];
  errors: ImportIssue[];
}

type Values = Record<string, CellValue>;

/**
 * The layout check, the cell pass and the key pass (spec Q10): everything about an import that needs
 * no database, so it runs before the write transaction opens. Instruction sheets are skipped. The
 * tab order doesn't matter: the apply pass follows the template's order.
 */
export function prepareImport(workbook: WorkbookSheets): PreparedImport {
  const errors: ImportIssue[] = [];
  const found = new Map<SheetKey, SheetRow<Values>[]>();
  for (const sheet of workbook) {
    if (isInstructionSheet(sheet.name)) continue;
    const spec = sheetNamed(sheet.name);
    if (!spec) {
      const name = sheet.name.trim();
      errors.push(
        issue(name, 1, null, "IMPORT_UNKNOWN_SHEET", `The sheet "${name}" isn't part of the template. Rename or remove it.`, {
          sheet: name,
        }),
      );
      continue;
    }
    const rows = readRows(spec, sheet, errors);
    if (rows) found.set(spec.key, rows);
  }

  const sheets = IMPORT_SHEETS.map(({ key }) => key).filter((key) => found.has(key));
  const cells = sheets.flatMap((key) => found.get(key)!.map(({ row, values }) => ({ sheet: sheetSpec(key).name, row, values })));
  if (cells.length === 0 && errors.length === 0) {
    errors.push(issue(null, null, null, "IMPORT_EMPTY", "The workbook has no rows to import."));
  }

  const rowsOf = (key: SheetKey) => found.get(key) ?? [];
  const parse = <S extends z.ZodType>(key: SheetKey, schema: S, rows = rowsOf(key)) => parseRows(key, schema, rows, errors);

  const materials = withoutNewInactive("materials", parse("materials", materialRowSchema), errors);
  const named = (key: "locations" | "customers" | "suppliers", noun: string) =>
    unique(key, withoutNewInactive(key, parse(key, namedRecordRowSchema), errors), (values) => values.id, byId("ID", noun), errors);

  return {
    materials: unique("materials", materials, (values) => values.id, byId("ID", "material"), errors),
    unitConversions: unique(
      "unitConversions",
      parse("unitConversions", unitConversionRowSchema),
      ({ material, unit }) => `${material} ${unit}`,
      {
        column: "Unit",
        message: (key, rows) => `The conversion ${key} appears on rows ${rows}: keep one row per material and unit.`,
      },
      errors,
    ),
    locations: named("locations", "location"),
    customers: named("customers", "customer"),
    suppliers: named("suppliers", "supplier"),
    planningParameters: unique(
      "planningParameters",
      parse("planningParameters", planningParameterRowSchema),
      ({ material, location }) => `${material} at ${location}`,
      {
        column: "Location ID",
        message: (key, rows) => `The parameters of ${key} appear on rows ${rows}: keep one row per material and location.`,
      },
      errors,
    ),
    safetyStock: unique(
      "safetyStock",
      parse("safetyStock", safetyStockRowSchema),
      ({ material, location, effectiveFrom }) => `${material} at ${location} from ${effectiveFrom}`,
      {
        column: "Effective from",
        message: (key, rows) => `The target of ${key} appears on rows ${rows}: keep one row per material, location and date.`,
      },
      errors,
    ),
    boms: prepareBoms(rowsOf("bomHeaders"), rowsOf("bomLines"), errors),
    sheets,
    cells,
    errors,
  };
}

function issue(
  sheet: string | null,
  row: number | null,
  column: string | null,
  code: string,
  message: string,
  params?: ImportIssue["params"],
): ImportIssue {
  return params ? { sheet, row, column, code, message, params } : { sheet, row, column, code, message };
}

const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1);

/**
 * A sheet's data rows, normalized by column (Q9), or null when its header row doesn't match the
 * template: every column must be there, and no other. Blank rows are skipped; a sheet with no
 * non-blank row at all is simply empty.
 */
function readRows(spec: SheetSpec, sheet: WorkbookSheet, errors: ImportIssue[]): SheetRow<Values>[] | null {
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
function parseRows<S extends z.ZodType>(key: SheetKey, schema: S, rows: SheetRow<Values>[], errors: ImportIssue[]): SheetRow<z.infer<S>>[] {
  const spec = sheetSpec(key);
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

const NEW_INACTIVE = "A new record starts active. Deactivate it after the import.";

/** Drops the new rows (blank ID) marked inactive, with their error (spec Q3). */
function withoutNewInactive<T extends { id: string | null; active: boolean | null }>(
  key: SheetKey,
  rows: SheetRow<T>[],
  errors: ImportIssue[],
): SheetRow<T>[] {
  const name = sheetSpec(key).name;
  return rows.filter(({ row, values }) => {
    if (values.id !== null || values.active !== false) return true;
    errors.push(issue(name, row, "Active", "IMPORT_NEW_RECORD_INACTIVE", NEW_INACTIVE));
    return false;
  });
}

/** How a duplicate key is reported: the column it is shown on, and the sentence naming the rows. */
interface DuplicateReport {
  column: string;
  message: (key: string, rows: string) => string;
}

/**
 * Drops every row whose key another row of the sheet also has, with an error on each naming the
 * rows (XLS-005, spec Q5). Rows without a key (a blank ID: a new record) are never duplicates.
 */
function unique<T>(
  key: SheetKey,
  rows: SheetRow<T>[],
  keyOf: (values: T) => string | null,
  report: DuplicateReport,
  errors: ImportIssue[],
): SheetRow<T>[] {
  const name = sheetSpec(key).name;
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
      errors.push(issue(name, row, report.column, "IMPORT_DUPLICATE_KEY", report.message(value, list), { key: value, rows: list }));
    }
  }
  return rows.filter(({ row }) => !duplicated.has(row));
}

/** The duplicate report of a sheet keyed by its records' own ID. */
const byId = (column: string, noun: string): DuplicateReport => ({
  column,
  message: (id, rows) => `${capitalized(noun)} ${id} appears on rows ${rows}: keep one row per ${noun}.`,
});

const HEADERS = "BOM headers";
const LINES = "BOM lines";

const targetKey = (target: BomTarget) => (target.kind === "id" ? `id:${target.id}` : `ref:${target.reference}`);

/**
 * The BOM headers, each with its complete recipe (spec Q8): new headers need an import reference
 * and an output, IDs and references are unique, every line finds its header, and every header has 1
 * to 100 lines. A header any of whose lines failed its own checks is left out without another error,
 * as are the lines of a header that failed: either would import a recipe the workbook doesn't hold.
 */
function prepareBoms(headerRows: SheetRow<Values>[], lineRows: SheetRow<Values>[], errors: ImportIssue[]): PreparedBom[] {
  let headers = withoutNewInactive("bomHeaders", parseRows("bomHeaders", bomHeaderRowSchema, headerRows, errors), errors).filter(
    ({ row, values }) => {
      if (values.id !== null) return true;
      let ok = true;
      if (values.reference === null) {
        const message = "A new BOM needs an import reference, which its BOM lines name.";
        errors.push(issue(HEADERS, row, "Import reference", "IMPORT_REFERENCE_REQUIRED", message));
        ok = false;
      }
      if (values.output === null) {
        errors.push(issue(HEADERS, row, "Output material ID", "VALIDATION_FAILED", OUTPUT_CHOICE_MESSAGE));
        ok = false;
      }
      return ok;
    },
  );
  headers = unique(
    "bomHeaders",
    headers,
    (values) => values.id,
    {
      column: "BOM ID",
      message: (id, rows) => `BOM ${id} appears on rows ${rows}: keep one row per BOM.`,
    },
    errors,
  );
  headers = unique(
    "bomHeaders",
    headers,
    (values) => values.reference,
    {
      column: "Import reference",
      message: (reference, rows) => `The import reference ${reference} appears on rows ${rows}: give each BOM its own.`,
    },
    errors,
  );

  // Every key a header row names, passed or not: a line naming a failed header is dropped silently.
  const named = new Set<string>();
  for (const { values } of headerRows) {
    if (typeof values.id === "string") named.add(`id:${values.id}`);
    if (typeof values.reference === "string") named.add(`ref:${values.reference}`);
  }
  const prepared = headers.map((header): PreparedBom => ({
    ...header,
    lines: [],
  }));
  const byKey = new Map<string, PreparedBom>();
  for (const bom of prepared) {
    if (bom.values.id !== null) byKey.set(`id:${bom.values.id}`, bom);
    if (bom.values.reference !== null) byKey.set(`ref:${bom.values.reference}`, bom);
  }

  const incomplete = new Set<PreparedBom>();
  const parsedLines = new Set(parseRows("bomLines", bomLineRowSchema, lineRows, errors));
  const lineByRow = new Map([...parsedLines].map((line) => [line.row, line]));
  for (const { row, values } of lineRows) {
    const target = values.bom as BomTarget | null;
    const bom = target ? byKey.get(targetKey(target)) : undefined;
    const line = lineByRow.get(row);
    if (!line) {
      if (bom) incomplete.add(bom);
      continue;
    }
    if (bom) {
      bom.lines.push(line);
      continue;
    }
    if (named.has(targetKey(line.values.bom))) continue;
    const message =
      line.values.bom.kind === "id"
        ? `BOM ${line.values.bom.id} has no row on the BOM headers sheet. Add its header: a BOM's lines are its complete recipe.`
        : `No row on the BOM headers sheet has the import reference ${line.values.bom.reference}.`;
    errors.push(issue(LINES, row, "BOM", "IMPORT_LINE_WITHOUT_HEADER", message));
  }

  return prepared.filter((bom) => {
    if (incomplete.has(bom)) return false;
    if (bom.lines.length === 0) {
      const message = "This BOM has no rows on the BOM lines sheet: list its complete recipe there.";
      errors.push(issue(HEADERS, bom.row, null, "IMPORT_BOM_WITHOUT_LINES", message));
      return false;
    }
    if (bom.lines.length > BOM_COMPONENTS_MAX) {
      errors.push(issue(HEADERS, bom.row, null, "VALIDATION_FAILED", COMPONENT_COUNT_MESSAGE));
      return false;
    }
    return true;
  });
}
