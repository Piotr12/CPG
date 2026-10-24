import { listSortSchema } from "../lists/list-query.schema";

/** The columns the locations, customers and suppliers lists sort by (#217); the first is their default order. */
export const NAMED_RECORD_SORTS = ["id", "name", "status"] as const;
export type NamedRecordSort = (typeof NAMED_RECORD_SORTS)[number];

export const namedRecordSortSchema = listSortSchema(NAMED_RECORD_SORTS);
