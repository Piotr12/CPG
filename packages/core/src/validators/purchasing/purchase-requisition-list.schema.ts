import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the Purchase requisitions list sorts by (#217); the first is its default order. The
 * stored quantities sort by their value (#224); the outstanding amount is computed, so it isn't one.
 */
export const REQUISITION_SORTS = ["id", "material", "location", "quantity", "converted", "requiredDate", "status", "abandoned"] as const;
export type RequisitionSort = (typeof REQUISITION_SORTS)[number];

export const requisitionSortSchema = listSortSchema(REQUISITION_SORTS);
