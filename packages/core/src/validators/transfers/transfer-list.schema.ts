import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the Transfers list sorts by (#217); the first is its default order. The route sorts by
 * its source, the planned dates by the dispatch date.
 */
export const TRANSFER_SORTS = ["id", "material", "source", "plannedDispatch", "status"] as const;
export type TransferSort = (typeof TRANSFER_SORTS)[number];

export const transferSortSchema = listSortSchema(TRANSFER_SORTS);
