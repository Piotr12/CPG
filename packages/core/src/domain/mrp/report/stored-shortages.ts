import { formatDecimal } from "../../quantities/decimal";
import { MRP_SHORTAGE_KINDS, type MrpDemandRootKind, type MrpShortage, type MrpShortageKind } from "../mrp-result";

/**
 * The code of a run's ranked shortages in the exception table (#380, spec Q2). A run stores them after its rejected
 * BOMs; the read never lists them as exceptions, but as each plan's `shortages`.
 */
export const MRP_SHORTAGE_CODE = "SHORTAGE";

/** Whether a stored code is a ranked shortage rather than an exception. */
export function isMrpShortageCode(code: string): boolean {
  return code === MRP_SHORTAGE_CODE;
}

/**
 * One requirement a run left uncovered, as the report reads it (#380): `MrpShortage` with its quantities as
 * six-decimal texts in the base unit (R03).
 */
export interface MrpShortageView {
  kind: MrpShortageKind;
  /** The day it is short on: the bucket it counts in. */
  date: string;
  /** Its priority date (`MrpShortage.originalDate`). */
  originalDate: string;
  /** The customer order's, production order's or transfer's ID, a planned component's parent; null for a forecast and the target. */
  document: string | null;
  /** A customer-order line's position; null for every other kind. */
  position: number | null;
  required: string;
  /** Above zero, at most `required`. */
  uncovered: string;
  /** A planned component's root priority (#327); null for every other kind. */
  root: { kind: MrpDemandRootKind; originalDate: string } | null;
}

/** A shortage as an `MrpRunException` row stores it: the pair, its day, and the rest as strings (spec, "Data Model"). */
export interface StoredShortage {
  code: typeof MRP_SHORTAGE_CODE;
  material: string;
  location: string;
  date: string;
  details: Record<string, string>;
}

/**
 * `shortage` of the pair as a stored row. The root's date is its `originalDate` (#327), so only the root's kind is kept;
 * the quantities are above zero, so they go through `formatDecimal`.
 */
export function toStoredShortage(material: string, location: string, shortage: MrpShortage): StoredShortage {
  const { kind, date, originalDate, document, position, required, uncovered, root } = shortage;
  return {
    code: MRP_SHORTAGE_CODE,
    material,
    location,
    date,
    details: {
      kind,
      originalDate,
      required: formatDecimal(required, { fixed: true }),
      uncovered: formatDecimal(uncovered, { fixed: true }),
      ...(document !== null && { document }),
      ...(position !== null && { position: String(position) }),
      ...(root !== null && { rootKind: root.kind }),
    },
  };
}

const KINDS: readonly string[] = MRP_SHORTAGE_KINDS;
const ROOT_KINDS: readonly string[] = MRP_SHORTAGE_KINDS.filter((kind) => kind !== "planned-component");
/** The kinds that name a document: every kind but the forecast and the target. */
const WITH_DOCUMENT: readonly string[] = ["component", "transfer", "customer-order", "planned-component"] satisfies MrpShortageKind[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUANTITY = /^\d+\.\d{6}$/;
const ZERO = /^0+\.0{6}$/;

/**
 * A stored row as a shortage, or null when this image can't read it (spec Q8): an unknown kind or root kind, a date or
 * quantity not as written, an uncovered quantity of zero, or a field its kind needs missing (another image's shape).
 */
export function readStoredShortage(date: string | null, details: Record<string, string> | null): MrpShortageView | null {
  if (date === null || !ISO_DATE.test(date) || !details) return null;
  const { kind, originalDate, required, uncovered, document, position, rootKind } = details;
  if (!KINDS.includes(kind) || !ISO_DATE.test(originalDate ?? "")) return null;
  if (!QUANTITY.test(required ?? "") || !QUANTITY.test(uncovered ?? "") || ZERO.test(uncovered)) return null;
  if (WITH_DOCUMENT.includes(kind) !== (document !== undefined)) return null;
  if ((kind === "customer-order") !== (position !== undefined) || (position !== undefined && !/^[1-9]\d*$/.test(position))) return null;
  if ((kind === "planned-component") !== (rootKind !== undefined) || (rootKind !== undefined && !ROOT_KINDS.includes(rootKind))) return null;
  return {
    kind: kind as MrpShortageKind,
    date,
    originalDate,
    document: document ?? null,
    position: position === undefined ? null : Number(position),
    required,
    uncovered,
    root: rootKind === undefined ? null : { kind: rootKind as MrpDemandRootKind, originalDate },
  };
}
