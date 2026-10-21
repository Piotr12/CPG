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
import type { BomTarget, WorkbookSheets } from "./cells";
import { issue, parseRows as parseSheetRows, readSheets, unique as uniqueRows, type DuplicateReport, type ImportIssue, type NormalizedRow, type SheetRow, type Values } from "./read-sheets";
import { MASTER_DATA_LAYOUT, sheetSpec, type SheetKey } from "./workbook-layout";

export type { ImportIssue, NormalizedRow, SheetRow } from "./read-sheets";

/** A BOM header with its complete recipe: the BOM lines that name it, in sheet order. */
export interface PreparedBom extends SheetRow<BomHeaderRow> {
  lines: SheetRow<BomLineRow>[];
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

/**
 * The layout check, the cell pass and the key pass (spec Q10): everything about an import that needs
 * no database, so it runs before the write transaction opens. Instruction sheets are skipped. The
 * tab order doesn't matter: the apply pass follows the template's order.
 */
export function prepareImport(workbook: WorkbookSheets): PreparedImport {
  const errors: ImportIssue[] = [];
  const { rows: found, sheets, cells } = readSheets(MASTER_DATA_LAYOUT, workbook, errors);

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

const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1);

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

/** The rows of the master sheet `key` that pass `schema`. */
function parseRows<S extends z.ZodType>(key: SheetKey, schema: S, rows: SheetRow<Values>[], errors: ImportIssue[]): SheetRow<z.infer<S>>[] {
  return parseSheetRows(sheetSpec(key), schema, rows, errors);
}

/** `uniqueRows` on the master sheet `key`. */
function unique<T>(key: SheetKey, rows: SheetRow<T>[], keyOf: (values: T) => string | null, report: DuplicateReport, errors: ImportIssue[]): SheetRow<T>[] {
  return uniqueRows(sheetSpec(key), rows, keyOf, report, errors);
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
    const missing = line.values.bom.kind === "id" ? line.values.bom.id : line.values.bom.reference;
    errors.push(issue(LINES, row, "BOM", "IMPORT_LINE_WITHOUT_HEADER", message, { bom: missing }));
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
