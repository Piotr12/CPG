import { listSortSchema } from "../lists/list-query.schema";

/** The columns the Purchase requisitions list sorts by (#217); the first is its default order. */
export const REQUISITION_SORTS = ["id", "material", "location", "requiredDate", "status"] as const;
export type RequisitionSort = (typeof REQUISITION_SORTS)[number];

export const requisitionSortSchema = listSortSchema(REQUISITION_SORTS);
