/**
 * The MRP exception codes (E16-S03), in rank order: within one pair they sort in this order (spec Q11).
 * They are the API's codes, so a screen translates an exception by code and `params`, never by its
 * message (lesson 2026-10-23). E17 adds its codes here (`CYCLIC_BOM`, E17-S01; `MISSING_USABLE_BOM` and
 * `NO_FEASIBLE_BOM`, E17-S02). A pair with `NO_FEASIBLE_BOM` keeps its proposals, so it never also has
 * one of the codes before it, which stop them.
 */
export const MRP_EXCEPTION_CODES = [
  "INVALID_UOM_CONVERSION",
  "MISSING_PLANNING_PARAMETERS",
  "MISSING_BOM",
  "MISSING_USABLE_BOM",
  "CYCLIC_BOM",
  "NO_FEASIBLE_BOM",
  "INSUFFICIENT_TRANSFER_STOCK",
] as const;
export type MrpExceptionCode = (typeof MRP_EXCEPTION_CODES)[number];

/** The fixed English message of each code: protected API texts (BACKWARD_COMPATIBILITY.md); record IDs travel in `params`. */
export const MRP_EXCEPTION_MESSAGES: Readonly<Record<MrpExceptionCode, string>> = {
  INVALID_UOM_CONVERSION: "A stored quantity, unit factor or date of this material isn't valid, so MRP proposes no supply for it.",
  MISSING_PLANNING_PARAMETERS: "This material has no usable planning parameters at this location, so MRP proposes no supply for it there.",
  MISSING_BOM: "This material is made at this location, but no active BOM has a current revision valid on the planned finish date, so MRP proposes no production.",
  MISSING_USABLE_BOM: "This material is made at this location, but every BOM valid on the planned finish date has an inactive component, so MRP proposes no production.",
  CYCLIC_BOM: "This material is on a cycle of BOMs, so MRP doesn't explode it and proposes no production for it here.",
  NO_FEASIBLE_BOM:
    "No usable BOM of this material can be supplied from stock and dependable supply on the proposal's planned start, so the proposal can't be produced as planned; its components are planned through the highest-priority usable BOM.",
  INSUFFICIENT_TRANSFER_STOCK: "The source can't supply this transfer's undispatched quantity on its dispatch day, so only the available part is planned.",
};

/** The message of a stored code this image doesn't list, written by a newer image before a rollback (spec Q7). */
export const MRP_EXCEPTION_FALLBACK_MESSAGE = "MRP raised an exception for this material at this location.";

/** `code`'s fixed message, or the fallback for a code this image doesn't know. */
export function mrpExceptionMessage(code: string): string {
  return (MRP_EXCEPTION_MESSAGES as Readonly<Record<string, string>>)[code] ?? MRP_EXCEPTION_FALLBACK_MESSAGE;
}

/** `code`'s place in the rank order. */
export function mrpExceptionRank(code: MrpExceptionCode): number {
  return MRP_EXCEPTION_CODES.indexOf(code);
}
