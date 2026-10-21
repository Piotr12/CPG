import { strFromU8, Unzip, UnzipInflate } from "fflate";
import readXlsxFile from "read-excel-file/node";
import writeXlsxFile, { type Cell as TemplateCell, type Sheet as TemplateSheet } from "write-excel-file/node";
import {
  IMPORT_CELLS_MAX,
  IMPORT_FILE_MAX_BYTES,
  IMPORT_INFLATED_MAX_BYTES,
  IMPORT_ROWS_MAX,
  INSTRUCTION_SHEETS,
  MASTER_DATA_LAYOUT,
  isInstructionSheet,
  ValidationError,
  type Bilingual,
  type Cell,
  type ColumnSpec,
  type ImportLayout,
  type WorkbookSheets,
} from "@cpg/core";
import {
  WORKBOOK_INFLATES_TOO_MUCH_MESSAGE,
  WORKBOOK_TOO_LARGE_MESSAGE,
  WORKBOOK_TOO_MANY_CELLS_MESSAGE,
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
 * whose headers understate its size can't unpack past the limit (a zip bomb). Returns each entry's
 * content as Latin-1 text when it stayed within `limit`, or "unreadable" when it isn't a zip
 * archive at all.
 */
export function inflateWithin(bytes: Uint8Array, limit: number): string[] | "too-large" | "unreadable" {
  let total = 0;
  let tooLarge = false;
  const entries: Uint8Array[][] = [];
  const unzip = new Unzip((file) => {
    const chunks: Uint8Array[] = [];
    entries.push(chunks);
    // Past the limit, nothing more is inflated: the answer is known.
    if (tooLarge) return;
    file.ondata = (error, chunk) => {
      if (error) throw error;
      total += chunk.length;
      chunks.push(chunk);
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
  if (entries.length === 0) return "unreadable";
  return entries.map((chunks) => chunks.map((chunk) => strFromU8(chunk, true)).join(""));
}

const CHARACTER_REFERENCE = /&#(?:x([0-9a-f]+)|(\d+));/gi;

/** An attribute value as the reader decodes it: character references, wrapped to 16 bits. */
const decoded = (value: string) =>
  value.replace(CHARACTER_REFERENCE, (_, hex: string | undefined, decimal: string | undefined) =>
    String.fromCharCode(hex === undefined ? Number(decimal) : parseInt(hex, 16)),
  );

const isSpace = (char: string) => char === " " || char === "\t" || char === "\n" || char === "\r";

interface StartTag {
  /** The name without its namespace prefix. */
  name: string;
  /** Every `r` attribute's decoded value, whatever its prefix. */
  addresses: string[];
  selfClosing: boolean;
  /** The index just past the tag's `>`. */
  end: number;
}

/**
 * The tag starting at `xml[at] === "<"`, read in one pass. A quoted value may hold `<` or `>`, as the
 * reader allows. An unclosed tag or value is null: nothing after it can be read as XML.
 */
function startTag(xml: string, at: number): StartTag | null {
  let index = at + 1;
  while (index < xml.length && !isSpace(xml[index]) && xml[index] !== "/" && xml[index] !== ">") index++;
  const qualified = xml.slice(at + 1, index);
  const tag: StartTag = { name: qualified.slice(qualified.indexOf(":") + 1), addresses: [], selfClosing: false, end: 0 };
  // A quoted value belongs to the last name before it, even across spaces and `=`.
  let attribute = "";
  let nameEnded = false;
  for (; index < xml.length; index++) {
    const char = xml[index];
    if (char === ">") {
      tag.selfClosing = xml[index - 1] === "/";
      tag.end = index + 1;
      return tag;
    }
    if (char === '"' || char === "'") {
      const close = xml.indexOf(char, index + 1);
      if (close === -1) return null;
      if (attribute.slice(attribute.indexOf(":") + 1) === "r") tag.addresses.push(decoded(xml.slice(index + 1, close)));
      attribute = "";
      nameEnded = false;
      index = close;
    } else if (char === "=" || isSpace(char)) {
      nameEnded = true;
    } else {
      if (nameEnded) attribute = "";
      nameEnded = false;
      attribute += char;
    }
  }
  return null;
}

/** A cell address as the reader parses it: every character before the first digit is a column letter. */
function cellAddress(address: string): { row: number; column: number } {
  const digit = address.search(/\d/);
  let column = 0;
  for (let at = 0; at < (digit === -1 ? 0 : digit); at++) column = column * 26 + address.charCodeAt(at) - 64;
  return { row: digit === -1 ? 0 : Number(address.slice(digit)), column };
}

/**
 * How many cells the spreadsheet reader would hold for one archive entry: its last row times its
 * last filled column. It reads `<row>` and `<c>` addresses the way `read-excel-file` does (namespace
 * prefixes ignored, character references decoded, `Number()` for row numbers, every character
 * before the row counted as a column letter), so a crafted address can't hide a far-away cell, and
 * where in doubt it counts more. An entry that isn't a worksheet spans next to nothing. The count
 * stops at an unclosed tag or value, where the reader stops too: an image's stray `<` and quotes
 * don't refuse its workbook.
 */
export function cellsSpanned(xml: string): number {
  let row = 0;
  let lastRow = 0;
  let lastColumn = 0;
  for (let at = xml.indexOf("<"); at !== -1; ) {
    const tag = startTag(xml, at);
    if (!tag) break;
    if (tag.name === "row") {
      // A row without a number is the next one.
      row = Math.max(row + 1, ...tag.addresses.map(Number).filter((number) => !Number.isNaN(number)));
    } else if (tag.name === "c") {
      for (const cell of tag.addresses.map(cellAddress)) {
        if (cell.row > row) row = cell.row;
        // The reader pads rows only up to the last cell that holds something.
        if (!tag.selfClosing) lastColumn = Math.max(lastColumn, cell.column);
      }
    }
    lastRow = Math.max(lastRow, row);
    at = xml.indexOf("<", tag.end);
  }
  return lastRow * Math.max(lastColumn, 1);
}

/**
 * The uploaded workbook's sheets, from its base64 form: at most 512 KB, unpacking to at most 20 MB,
 * spanning at most 200,000 cells, a readable `.xlsx`, and at most 2,000 data rows outside the
 * instruction sheets. Anything else is `VALIDATION_FAILED` on `workbook`, before any row is looked
 * at (Q10). The sizes are checked before the spreadsheet reader runs, which holds every cell it spans.
 */
export async function readWorkbook(base64: string): Promise<WorkbookSheets> {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > IMPORT_FILE_MAX_BYTES) throw refuse(WORKBOOK_TOO_LARGE_MESSAGE);
  const entries = inflateWithin(bytes, IMPORT_INFLATED_MAX_BYTES);
  if (entries === "too-large") throw refuse(WORKBOOK_INFLATES_TOO_MUCH_MESSAGE);
  if (entries === "unreadable") throw refuse(WORKBOOK_UNREADABLE_MESSAGE);
  if (entries.reduce((cells, entry) => cells + cellsSpanned(entry), 0) > IMPORT_CELLS_MAX) throw refuse(WORKBOOK_TOO_MANY_CELLS_MESSAGE);

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

const HEADINGS: Record<"column" | "required" | "meaning" | "example", Bilingual> = {
  column: { en: "Column", pl: "Kolumna" },
  required: { en: "Required", pl: "Wymagana" },
  meaning: { en: "Meaning", pl: "Znaczenie" },
  example: { en: "Example", pl: "Przykład" },
};

/** One instruction sheet: the layout's rules, then each data sheet's purpose and columns, in one language. */
function instructions(layout: ImportLayout, language: keyof Bilingual): TemplateSheet<Buffer> {
  const data: TemplateCell[][] = [[bold(layout.title[language])], [], ...layout.rules.map((rule) => [rule[language]])];
  for (const sheet of layout.sheets) {
    data.push([], [bold(sheet.name)], [sheet.purpose[language]]);
    data.push([HEADINGS.column, HEADINGS.required, HEADINGS.meaning, HEADINGS.example].map((heading) => bold(heading[language])));
    for (const column of sheet.columns) {
      data.push([column.header, REQUIRED[column.required][language], column.meaning[language], column.example]);
    }
  }
  return { sheet: INSTRUCTION_SHEETS[language], data, columns: [{ width: 24 }, { width: 26 }, { width: 90 }, { width: 18 }] };
}

/**
 * An import template (XLS-001, XLS-017, STX-001): every data sheet of `layout` (default: the
 * master-data workbook) with only its bold header row, in apply order, then the Instructions
 * (English) and Instrukcja (Polish) sheets explaining every column with an example.
 */
export async function templateWorkbook(layout: ImportLayout = MASTER_DATA_LAYOUT): Promise<Buffer> {
  const sheets: TemplateSheet<Buffer>[] = layout.sheets.map((sheet) => ({
    sheet: sheet.name,
    data: [sheet.columns.map((column) => bold(column.header))],
    columns: sheet.columns.map((column) => ({ width: Math.max(14, column.header.length + 4) })),
  }));
  return writeXlsxFile([...sheets, instructions(layout, "en"), instructions(layout, "pl")]).toBuffer();
}
