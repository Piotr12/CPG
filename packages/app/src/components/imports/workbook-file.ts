import { Unzip, UnzipInflate } from "fflate";
import readXlsxFile from "read-excel-file/node";
import writeXlsxFile, { type Cell as TemplateCell, type Sheet as TemplateSheet } from "write-excel-file/node";
import {
  IMPORT_FILE_MAX_BYTES,
  IMPORT_INFLATED_MAX_BYTES,
  IMPORT_ROWS_MAX,
  IMPORT_RULES,
  IMPORT_SHEETS,
  INSTRUCTION_SHEETS,
  isInstructionSheet,
  ValidationError,
  type Bilingual,
  type Cell,
  type ColumnSpec,
  type WorkbookSheets,
} from "@cpg/core";
import {
  WORKBOOK_INFLATES_TOO_MUCH_MESSAGE,
  WORKBOOK_TOO_LARGE_MESSAGE,
  WORKBOOK_TOO_MANY_ROWS_MESSAGE,
  WORKBOOK_UNREADABLE_MESSAGE,
} from "@cpg/core/validators/imports/import-request.schema";

/*
 * The import's `.xlsx` adapter (spec `2026-10-20--0908UTC-master-data-bom-import`, Q10, Q14): the
 * only file that imports the spreadsheet libraries, so `core` sees plain cells and swapping a
 * library touches this file alone. Server only: it is never imported by a client component.
 */

/** What the template is served as. */
export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const refuse = (message: string) => new ValidationError({ workbook: [message] });

/**
 * Inflates every entry of a zip archive while counting the bytes it actually produces, so a file
 * whose headers understate its size can't unpack past the limit (a zip bomb). Returns whether it
 * stayed within `limit`, or "unreadable" when it isn't a zip archive at all.
 */
export function inflatesWithin(bytes: Uint8Array, limit: number): "ok" | "too-large" | "unreadable" {
  let total = 0;
  let entries = 0;
  let tooLarge = false;
  const unzip = new Unzip((file) => {
    entries += 1;
    file.ondata = (error, chunk) => {
      if (error) throw error;
      total += chunk.length;
      if (total > limit && !tooLarge) {
        tooLarge = true;
        file.terminate();
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(bytes, true);
  } catch {
    return "unreadable";
  }
  if (tooLarge) return "too-large";
  return entries === 0 ? "unreadable" : "ok";
}

/**
 * The uploaded workbook's sheets, from its base64 form: at most 512 KB, unpacking to at most 20 MB,
 * a readable `.xlsx`, and at most 2,000 data rows outside the instruction sheets. Anything else is
 * `VALIDATION_FAILED` on `workbook`, before any row is looked at (Q10).
 */
export async function readWorkbook(base64: string): Promise<WorkbookSheets> {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > IMPORT_FILE_MAX_BYTES) throw refuse(WORKBOOK_TOO_LARGE_MESSAGE);
  const inflated = inflatesWithin(bytes, IMPORT_INFLATED_MAX_BYTES);
  if (inflated === "too-large") throw refuse(WORKBOOK_INFLATES_TOO_MUCH_MESSAGE);
  if (inflated === "unreadable") throw refuse(WORKBOOK_UNREADABLE_MESSAGE);

  let sheets: WorkbookSheets;
  try {
    sheets = (await readXlsxFile(bytes)).map(({ sheet, data }) => ({ name: sheet, rows: data as unknown as Cell[][] }));
  } catch {
    throw refuse(WORKBOOK_UNREADABLE_MESSAGE);
  }
  const dataRows = sheets
    .filter((sheet) => !isInstructionSheet(sheet.name))
    .reduce((count, sheet) => count + sheet.rows.slice(1).filter((row) => row.some((cell) => cell !== null && cell !== "")).length, 0);
  if (dataRows > IMPORT_ROWS_MAX) throw refuse(WORKBOOK_TOO_MANY_ROWS_MESSAGE);
  return sheets;
}

const bold = (value: string): TemplateCell => ({ value, fontWeight: "bold" });

const REQUIRED: Record<ColumnSpec["required"], Bilingual> = {
  always: { en: "Required", pl: "Wymagana" },
  "on-create": { en: "Required for a new record", pl: "Wymagana dla nowego rekordu" },
  never: { en: "Optional", pl: "Opcjonalna" },
};

const HEADINGS: Record<"title" | "column" | "required" | "meaning" | "example", Bilingual> = {
  title: { en: "CPG import template", pl: "Szablon importu CPG" },
  column: { en: "Column", pl: "Kolumna" },
  required: { en: "Required", pl: "Wymagana" },
  meaning: { en: "Meaning", pl: "Znaczenie" },
  example: { en: "Example", pl: "Przykład" },
};

/** One instruction sheet: the rules, then each data sheet's purpose and columns, in one language. */
function instructions(language: keyof Bilingual): TemplateSheet<Buffer> {
  const data: TemplateCell[][] = [[bold(HEADINGS.title[language])], [], ...IMPORT_RULES.map((rule) => [rule[language]])];
  for (const sheet of IMPORT_SHEETS) {
    data.push([], [bold(sheet.name)], [sheet.purpose[language]]);
    data.push([HEADINGS.column, HEADINGS.required, HEADINGS.meaning, HEADINGS.example].map((heading) => bold(heading[language])));
    for (const column of sheet.columns) {
      data.push([column.header, REQUIRED[column.required][language], column.meaning[language], column.example]);
    }
  }
  return { sheet: INSTRUCTION_SHEETS[language], data, columns: [{ width: 24 }, { width: 26 }, { width: 90 }, { width: 18 }] };
}

/**
 * The import template (XLS-001, XLS-017): every data sheet with only its bold header row, in apply
 * order, then the Instructions (English) and Instrukcja (Polish) sheets explaining every column.
 */
export async function templateWorkbook(): Promise<Buffer> {
  const sheets: TemplateSheet<Buffer>[] = IMPORT_SHEETS.map((sheet) => ({
    sheet: sheet.name,
    data: [sheet.columns.map((column) => bold(column.header))],
    columns: sheet.columns.map((column) => ({ width: Math.max(14, column.header.length + 4) })),
  }));
  return writeXlsxFile([...sheets, instructions("en"), instructions("pl")]).toBuffer();
}
