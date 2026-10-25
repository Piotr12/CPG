import { listQueryShape, listSortSchema } from "../lists/list-query.schema";
import { transferListSchema } from "./transfer.schema";

/**
 * The columns the Transfers list sorts by (#217); the first is its default order. The route sorts by
 * its source, the planned dates by the dispatch date, the stored quantities by their value (#224); the
 * amount in transit is computed, so it isn't one.
 */
export const TRANSFER_SORTS = ["id", "material", "source", "quantity", "dispatched", "received", "plannedDispatch", "status"] as const;
export type TransferSort = (typeof TRANSFER_SORTS)[number];

export const transferSortSchema = listSortSchema(TRANSFER_SORTS);

/** `GET /api/tenants/{tenant}/transfers`'s query (#221): an optional search and sort besides its `page`; another key is still 400. */
export const transferApiQuerySchema = transferListSchema.extend(listQueryShape(TRANSFER_SORTS));
