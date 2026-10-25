import { z } from "zod";
import { listQueryShape, listSortSchema } from "../lists/list-query.schema";

/** The columns the locations, customers and suppliers lists sort by (#217); the first is their default order. */
export const NAMED_RECORD_SORTS = ["id", "name", "status"] as const;
export type NamedRecordSort = (typeof NAMED_RECORD_SORTS)[number];

export const namedRecordSortSchema = listSortSchema(NAMED_RECORD_SORTS);

/** The query of `GET /api/tenants/{tenant}/locations`, `…/customers` and `…/suppliers` (#221): an optional search and sort; other keys are ignored, as before. */
export const namedRecordApiQuerySchema = z.object(listQueryShape(NAMED_RECORD_SORTS));
