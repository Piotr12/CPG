import { formatDecimal } from "../../quantities/decimal";
import { parseStoredFigure } from "../../stock/signed-quantity";
import { MRP_SHORTAGE_KINDS, type MrpDemandRootKind, type MrpShortage, type MrpShortageKind } from "../mrp-result";

/**
 * The code of a pair's ranked shortages in the exception table (#380, spec Q2). A run stores one such row per pair
 * with anything short, after its rejected BOMs; the read never lists it as an exception, but as the plan's `shortages`.
 */
export const MRP_SHORTAGE_CODE = "SHORTAGE";

/** Whether a stored code is a pair's ranked shortages rather than an exception. */
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

/** A pair's shortages as an `MrpRunException` row stores them: the pair, its first short day, and its entries (spec, "Data Model"). */
export interface StoredShortages {
  code: typeof MRP_SHORTAGE_CODE;
  material: string;
  location: string;
  date: string;
  details: { entries: string };
}

/** What stands for a field the entry's kind doesn't have. */
const NONE = "-";

/**
 * The pair's shortages as one stored row, or null when nothing is short. Each entry is one `;`-separated item of
 * space-separated fields, in the engine's order: `date kind originalDate document position required uncovered rootKind`,
 * `-` where the kind has none, e.g. `2026-10-06 customer-order 2026-10-06 00000002 0 10.000000 8.000000 -`. IDs and
 * dates hold no space. The root's date is its `originalDate` (#327), so only the root's kind is kept; the quantities
 * are above zero, so they go through `formatDecimal`.
 */
export function toStoredShortages(material: string, location: string, shortages: readonly MrpShortage[]): StoredShortages | null {
  if (shortages.length === 0) return null;
  const entries = shortages.map(({ kind, date, originalDate, document, position, required, uncovered, root }) =>
    [date, kind, originalDate, document ?? NONE, position ?? NONE, formatDecimal(required, { fixed: true }), formatDecimal(uncovered, { fixed: true }), root?.kind ?? NONE].join(" "),
  );
  return { code: MRP_SHORTAGE_CODE, material, location, date: shortages[0].date, details: { entries: entries.join(";") } };
}

const KINDS: readonly string[] = MRP_SHORTAGE_KINDS;
const ROOT_KINDS: readonly string[] = MRP_SHORTAGE_KINDS.filter((kind) => kind !== "planned-component");
/** The kinds that name a document: every kind but the forecast and the target. */
const WITH_DOCUMENT: readonly string[] = ["component", "transfer", "customer-order", "planned-component"] satisfies MrpShortageKind[];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUANTITY = /^\d+\.\d{6}$/;
const ZERO = /^0+\.0{6}$/;

/**
 * A stored row's shortages, in stored order. An entry this image can't read is left out, never guessed (spec Q8): an
 * unknown kind or root kind, a date or quantity not as written, an uncovered quantity of zero or above what is required, a field its kind needs
 * missing or one it doesn't have present (another image's shape).
 */
export function readStoredShortages(details: Record<string, string> | null): MrpShortageView[] {
  const entries = details?.entries;
  if (typeof entries !== "string" || entries === "") return [];
  return entries.split(";").flatMap((entry) => {
    const shortage = readEntry(entry);
    return shortage ? [shortage] : [];
  });
}

function readEntry(entry: string): MrpShortageView | null {
  const fields = entry.split(" ");
  if (fields.length !== 8) return null;
  const [date, kind, originalDate, document, position, required, uncovered, rootKind] = fields;
  if (!ISO_DATE.test(date) || !KINDS.includes(kind) || !ISO_DATE.test(originalDate)) return null;
  if (!QUANTITY.test(required) || !QUANTITY.test(uncovered) || ZERO.test(uncovered) || parseStoredFigure(uncovered) > parseStoredFigure(required)) return null;
  if (WITH_DOCUMENT.includes(kind) === (document === NONE)) return null;
  if ((kind === "customer-order") === (position === NONE) || (position !== NONE && !/^\d+$/.test(position))) return null;
  if ((kind === "planned-component") === (rootKind === NONE) || (rootKind !== NONE && !ROOT_KINDS.includes(rootKind))) return null;
  return {
    kind: kind as MrpShortageKind,
    date,
    originalDate,
    document: document === NONE ? null : document,
    position: position === NONE ? null : Number(position),
    required,
    uncovered,
    root: rootKind === NONE ? null : { kind: rootKind as MrpDemandRootKind, originalDate },
  };
}
