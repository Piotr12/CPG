import type { ColumnKind } from "./workbook-layout";

/**
 * A cell as a spreadsheet reader returns it. Admins fill templates in Excel, LibreOffice and Google
 * Sheets, which turn `00000001` into the number 1 and dates into date cells, so the import reads
 * those forms too (spec `2026-10-20--0908UTC-master-data-bom-import`, Q9).
 */
export type Cell = string | number | boolean | Date | null | undefined;

/** One sheet of an uploaded workbook: its tab name and its rows of cells, the header row first. */
export interface WorkbookSheet {
  name: string;
  rows: Cell[][];
}

export type WorkbookSheets = WorkbookSheet[];

/** A BOM line's BOM column: an existing BOM's ID, or a new BOM's import reference. */
export type BomTarget = { kind: "id"; id: string } | { kind: "reference"; reference: string };

/** What a cell normalizes to: text (or null when blank), a yes/no flag, or a BOM target. */
export type CellValue = string | boolean | BomTarget | null;

const DIGITS = /^\d+$/;
const SHORT_ID = /^\d{1,8}$/;
const ID_MAX = 99_999_999;

/** Whether a cell holds nothing: empty, whitespace, null or undefined. */
export function isBlank(cell: Cell): boolean {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

/**
 * A number in plain decimal notation, never exponent notation: `1e-7` → `"0.0000001"`, `1.5e21` →
 * `"1500000000000000000000"`. The digits are the number's shortest round-trip form, so `0.1` stays
 * `"0.1"`, never the binary float's long expansion.
 */
export function plainNumber(value: number): string {
  const text = String(value);
  const [mantissa, exponentText] = text.split("e");
  if (exponentText === undefined) return text;
  const negative = mantissa.startsWith("-");
  const [whole, fraction = ""] = mantissa.replace("-", "").split(".");
  const digits = whole + fraction;
  const point = whole.length + Number(exponentText);
  // JavaScript writes exponents only below 1e-6 and from 1e21, so the point always falls outside
  // the (at most 17) digits: before them, or after them with zeros to add.
  const plain = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : digits + "0".repeat(point - digits.length);
  return negative ? `-${plain}` : plain;
}

/** A date cell's calendar day, read in UTC (readers build date cells at UTC midnight). */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Any non-blank cell as trimmed text: numbers in plain notation, dates as `YYYY-MM-DD`, flags as TRUE/FALSE. */
export function cellText(cell: Cell): string | null {
  if (isBlank(cell)) return null;
  if (typeof cell === "number") return plainNumber(cell);
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? "" : isoDate(cell);
  return (cell as string).trim();
}

/**
 * An eight-digit ID: a whole number from 0 to 99999999 or text of 1–8 digits, zero-padded. Anything
 * else comes back as its text, so the ID schema refuses it with its own message.
 */
export function idText(cell: Cell): string | null {
  if (typeof cell === "number" && Number.isInteger(cell) && cell >= 0 && cell <= ID_MAX) {
    return String(cell).padStart(8, "0");
  }
  const text = cellText(cell);
  return text !== null && SHORT_ID.test(text) ? text.padStart(8, "0") : text;
}

const YES = new Set(["yes", "true", "tak"]);
const NO = new Set(["no", "false", "nie"]);

/** A yes/no cell: a boolean cell, or yes/no/true/false/tak/nie in any case. Anything else stays text, for the schema to refuse. */
export function activeValue(cell: Cell): boolean | string | null {
  if (typeof cell === "boolean") return cell;
  const text = cellText(cell);
  if (text === null) return null;
  const word = text.toLowerCase();
  if (YES.has(word)) return true;
  if (NO.has(word)) return false;
  return text;
}

/**
 * A BOM line's BOM: digits (or a whole number) are a BOM ID, zero-padded; anything else is an import
 * reference, which always has a letter (spec Q8).
 */
export function bomTarget(cell: Cell): BomTarget | null {
  const text = cellText(cell);
  if (text === null) return null;
  return DIGITS.test(text) ? { kind: "id", id: idText(cell)! } : { kind: "reference", reference: text };
}

/** A cell normalized for its column's kind (Q9). */
export function normalizeCell(kind: ColumnKind, cell: Cell): CellValue {
  switch (kind) {
    case "id":
      return idText(cell);
    case "word":
      return cellText(cell)?.toLowerCase() ?? null;
    case "active":
      return activeValue(cell);
    case "bom":
      return bomTarget(cell);
    default:
      // `text` and `date`: a date cell already reads as `YYYY-MM-DD`, and date text is kept as typed.
      return cellText(cell);
  }
}
