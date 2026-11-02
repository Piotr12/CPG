import { formatDecimal } from "../../quantities/decimal";
import type { MrpBomRejection, MrpException, MrpInactiveBom } from "../mrp-result";
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
    case "MISSING_USABLE_BOM":
      return { ...row, date: exception.date, details: { inactive: inactiveNotation(exception.inactive) } };
    case "CYCLIC_BOM":
      return { ...row, date: null, details: { path: exception.path } };
    case "NO_FEASIBLE_BOM":
      return { ...row, date: exception.date, details: rejectionDetails(exception.rejections) };
    case "AT_RISK_PRODUCTION": {
      const { order, quantity, inactiveComponents } = exception;
      return { ...row, date: exception.date, details: { order, quantity: formatDecimal(quantity, { fixed: true }), inactiveComponents: inactiveComponents.join(", ") } };
    }
    case "INSUFFICIENT_TRANSFER_STOCK": {
      const { transfer, destination, planned, available } = exception;
      return { ...row, date: exception.date, details: { transfer, destination, planned: formatDecimal(planned, { fixed: true }), available: formatDecimal(available, { fixed: true }) } };
    }
  }
}

/**
 * Why no usable BOM could be supplied (E17-S02): `missing`, each usable BOM's short components, and `inactive`,
 * each valid BOM's inactive ones, only when there are some. No Feasible BOM and a provisional action share it.
 */
export function rejectionDetails(rejections: readonly MrpBomRejection[]): { missing: string; inactive?: string } {
  const inactive = rejections.flatMap((rejection) => (rejection.reason === "inactive-component" ? [rejection] : []));
  const missing = rejections.flatMap((rejection) => (rejection.reason === "shortage" ? [rejection] : []));
  return { missing: missingNotation(missing), ...(inactive.length > 0 && { inactive: inactiveNotation(inactive) }) };
}

/**
 * Each BOM's inactive components, in the language-neutral notation the API lists (E17-S02 spec):
 * `00000004/1: 00000011, 00000012`, BOMs separated by `; `.
 */
function inactiveNotation(boms: readonly Pick<MrpInactiveBom, "bom" | "revision" | "materials">[]): string {
  return boms.map(({ bom, revision, materials }) => `${bom}/${revision}: ${materials.join(", ")}`).join("; ");
}

/**
 * Each BOM's short components with their required, available and shortage quantities as six-decimal texts:
 * `00000005/2: 00000013 6.000000 5.000000 1.000000, …`, BOMs separated by `; `.
 */
function missingNotation(boms: readonly Extract<MrpBomRejection, { reason: "shortage" }>[]): string {
  const fixed = (quantity: bigint) => formatDecimal(quantity, { fixed: true });
  return boms
    .map(({ bom, revision, shortages }) => `${bom}/${revision}: ${shortages.map(({ material, required, available, shortage }) => `${material} ${fixed(required)} ${fixed(available)} ${fixed(shortage)}`).join(", ")}`)
    .join("; ");
}

/** A stored row's `params`, as the API lists them: the pair, the date when there is one, then the code's other params. */
export function exceptionParams({ material, location, date, details }: Pick<StoredException, "material" | "location" | "date" | "details">): Record<string, string> {
  return { material, location, ...(date !== null && { date }), ...details };
}
