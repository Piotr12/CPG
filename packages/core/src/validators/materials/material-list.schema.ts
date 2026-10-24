import { listSortSchema } from "../lists/list-query.schema";

/** The columns the Materials list sorts by (#217); the first is its default order. */
export const MATERIAL_SORTS = ["id", "description", "type", "baseUnit", "status"] as const;
export type MaterialSort = (typeof MATERIAL_SORTS)[number];

export const materialSortSchema = listSortSchema(MATERIAL_SORTS);
