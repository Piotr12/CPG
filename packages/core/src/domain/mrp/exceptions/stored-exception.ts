import { formatDecimal } from "../../quantities/decimal";
import type { MrpException } from "../mrp-result";
import { exceptionLocation } from "./compare-exceptions";

/** An exception as an `MrpRunException` row stores it (E16-S03): the pair, the date when it has one, and its other params as strings. */
export interface StoredException {
  code: MrpException["code"];
  material: string;
  location: string;
  date: string | null;
  details: Record<string, string> | null;
}

/** `exception` as a stored row: quantities as six-decimal texts, a transfer at its source (spec Q7). */
export function toStoredException(exception: MrpException): StoredException {
  const { code, material } = exception;
  const row = { code, material, location: exceptionLocation(exception) };
  switch (exception.code) {
    case "INVALID_UOM_CONVERSION":
      return { ...row, date: null, details: { record: exception.record, ...(exception.document !== undefined && { document: exception.document }) } };
    case "MISSING_PLANNING_PARAMETERS":
      return { ...row, date: exception.date ?? null, details: { reason: exception.reason } };
    case "MISSING_BOM":
      return { ...row, date: exception.date, details: null };
    case "BOM_CYCLE":
      return { ...row, date: null, details: { path: exception.path } };
    case "INSUFFICIENT_TRANSFER_STOCK": {
      const { transfer, destination, planned, available } = exception;
      return { ...row, date: exception.date, details: { transfer, destination, planned: formatDecimal(planned, { fixed: true }), available: formatDecimal(available, { fixed: true }) } };
    }
  }
}

/** A stored row's `params`, as the API lists them: the pair, the date when there is one, then the code's other params. */
export function exceptionParams({ material, location, date, details }: Pick<StoredException, "material" | "location" | "date" | "details">): Record<string, string> {
  return { material, location, ...(date !== null && { date }), ...details };
}
