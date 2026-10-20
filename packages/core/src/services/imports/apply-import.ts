import type { ImportIssue, PreparedImport } from "../../domain/imports/prepare-import";
import { previewToken } from "../../domain/imports/preview-token";
import { IMPORT_SHEETS } from "../../domain/imports/workbook-layout";
import type { ApplyContext, ImportRowOutcome } from "./apply-context";
import { importBoms } from "./rows/boms";
import { importMaterials } from "./rows/materials";
import { importNamedRecords, namedRecordKinds } from "./rows/named-records";
import { importPlanningParameters } from "./rows/planning-parameters";
import { importSafetyStock } from "./rows/safety-stock";
import { importUnitConversions } from "./rows/unit-conversions";

/** One sheet's count of rows by outcome, and of errors placed on it. */
export interface ImportSheetSummary {
  sheet: string;
  created: number;
  updated: number;
  unchanged: number;
  errors: number;
}

/** What a dry run or a commit answers (spec `2026-10-20--0908UTC-master-data-bom-import`, API Contracts). */
export interface ImportReport {
  committed: boolean;
  /** Only from a dry run without errors (Q7). */
  previewToken: string | null;
  summary: ImportSheetSummary[];
  rows: ImportRowOutcome[];
  errors: ImportIssue[];
}

/**
 * The apply pass (spec Q6): every prepared row, sheet by sheet in the template's order, through its
 * service. Returns the report without its `committed` flag, with the preview token when no row
 * failed. The caller runs it inside `inRequestSavepoint` and decides whether to keep it.
 */
export async function applyImport(context: ApplyContext, prepared: PreparedImport, generation: number): Promise<Omit<ImportReport, "committed">> {
  context.errors.push(...prepared.errors);
  await importMaterials(context, prepared.materials);
  await importUnitConversions(context, prepared.unitConversions);
  for (const kind of namedRecordKinds(context)) await importNamedRecords(context, kind, prepared[kind.key]);
  await importPlanningParameters(context, prepared.planningParameters);
  await importSafetyStock(context, prepared.safetyStock);
  await importBoms(context, prepared.boms);

  const errors = ordered(context.errors);
  const rows = context.outcomes;
  const token = errors.length > 0 ? null : previewToken({ generation, cells: prepared.cells, rows, versions: context.versions });
  return { previewToken: token, summary: summarize(prepared, rows, errors), rows, errors };
}

const SHEET_ORDER = new Map(IMPORT_SHEETS.map(({ name }, index) => [name, index]));

/**
 * Errors by sheet (unknown sheets last), then row, keeping their order within a row. Only
 * `IMPORT_EMPTY` has no sheet or row, and it is always the only error, so it is never compared.
 */
function ordered(errors: ImportIssue[]): ImportIssue[] {
  const sheetRank = ({ sheet }: ImportIssue) => SHEET_ORDER.get(sheet!) ?? IMPORT_SHEETS.length;
  return errors
    .map((error, index) => ({ error, index }))
    .sort((a, b) => sheetRank(a.error) - sheetRank(b.error) || a.error.row! - b.error.row! || a.index - b.index)
    .map(({ error }) => error);
}

/** One line per data sheet the workbook has, or that an error names. */
function summarize(prepared: PreparedImport, rows: ImportRowOutcome[], errors: ImportIssue[]): ImportSheetSummary[] {
  const names = new Set(prepared.sheets.map((key) => IMPORT_SHEETS.find((sheet) => sheet.key === key)!.name));
  for (const { sheet } of errors) if (sheet !== null && SHEET_ORDER.has(sheet)) names.add(sheet);
  return IMPORT_SHEETS.filter(({ name }) => names.has(name)).map(({ name }) => {
    const count = (action: ImportRowOutcome["action"]) => rows.filter((row) => row.sheet === name && row.action === action).length;
    return {
      sheet: name,
      created: count("create"),
      updated: count("update"),
      unchanged: count("unchanged"),
      errors: errors.filter((error) => error.sheet === name).length,
    };
  });
}
