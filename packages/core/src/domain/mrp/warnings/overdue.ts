import { formatDecimal } from "../../quantities/decimal";
import type { MrpPlan, MrpWarning } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/**
 * The MRP warning codes (E18-S02), in rank order. A run stores its warnings in the exception table
 * after its exceptions, but the read never lists them as exceptions: they are the report's marks.
 */
export const MRP_WARNING_CODES = ["OVERDUE_SUPPLY", "OVERDUE_TRANSFER"] as const;
export type MrpWarningCode = (typeof MRP_WARNING_CODES)[number];

/** Whether a stored code is a warning rather than an exception. */
export function isMrpWarningCode(code: string): code is MrpWarningCode {
  return (MRP_WARNING_CODES as readonly string[]).includes(code);
}

/**
 * One warning per overdue supply item `plan` counts (spec Q2): purchasing supply and production output
 * (Overdue Supply), and transfer arrivals at this destination (Overdue Transfer). Overdue demand isn't warned.
 */
export function overdueWarnings({ material, location, supply, productionOutput, transfersIn }: MrpPlan): MrpWarning[] {
  const pair = { material, location };
  return [
    ...supply.filter((item) => item.overdue).map((item): MrpWarning => ({
      code: "OVERDUE_SUPPLY", ...pair, date: item.date, source: item.kind, document: item.document,
      ...(item.position !== null && { position: item.position }), plannedDate: item.plannedDate, quantity: item.quantity,
    })),
    ...productionOutput.filter((item) => item.overdue).map((item): MrpWarning => ({
      code: "OVERDUE_SUPPLY", ...pair, date: item.date, source: "production-order", document: item.order, plannedDate: item.plannedFinish, quantity: item.quantity,
    })),
    ...transfersIn.filter((item) => item.overdue).map((item): MrpWarning => ({
      code: "OVERDUE_TRANSFER", ...pair, date: item.date, transfer: item.transfer, stage: item.stage, plannedDate: item.plannedDate, quantity: item.quantity,
    })),
  ];
}

/**
 * The run's warning order, a total one whatever the snapshot's order (spec, "The overdue warnings"): by
 * material, location, code rank, the document's own date, then its kind or stage, its ID and its
 * position (none first), all in code-unit order. One transfer can arrive twice at a destination (in
 * transit and planned), and a requisition can share its ID with a production order; the kind tells them apart.
 */
export function compareWarnings(a: MrpWarning, b: MrpWarning): number {
  return (
    compareCodes(a.material, b.material) ||
    compareCodes(a.location, b.location) ||
    MRP_WARNING_CODES.indexOf(a.code) - MRP_WARNING_CODES.indexOf(b.code) ||
    compareCodes(a.plannedDate, b.plannedDate) ||
    compareCodes(kindOf(a), kindOf(b)) ||
    compareCodes(documentOf(a), documentOf(b)) ||
    positionOf(a) - positionOf(b)
  );
}

const kindOf = (warning: MrpWarning) => (warning.code === "OVERDUE_SUPPLY" ? warning.source : warning.stage);
const documentOf = (warning: MrpWarning) => (warning.code === "OVERDUE_SUPPLY" ? warning.document : warning.transfer);
const positionOf = (warning: MrpWarning) => (warning.code === "OVERDUE_SUPPLY" ? (warning.position ?? 0) : 0);

/** A warning as an `MrpRunException` row stores it: the pair, its day, and its other params as strings. */
export interface StoredWarning {
  code: MrpWarningCode;
  material: string;
  location: string;
  date: string;
  details: Record<string, string>;
}

/** `warning` as a stored row: the quantity as a six-decimal text (it is above zero), the position as a string. */
export function toStoredWarning(warning: MrpWarning): StoredWarning {
  const { code, material, location, date, plannedDate } = warning;
  const quantity = formatDecimal(warning.quantity, { fixed: true });
  if (warning.code === "OVERDUE_TRANSFER") {
    return { code, material, location, date, details: { transfer: warning.transfer, stage: warning.stage, plannedDate, quantity } };
  }
  const { source, document, position } = warning;
  return { code, material, location, date, details: { source, document, ...(position !== undefined && { position: String(position) }), plannedDate, quantity } };
}
