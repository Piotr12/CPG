import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the BOMs list sorts by (#217); the first, the output material's ID (then priority),
 * is its default order (BOM-008).
 */
export const BOM_SORTS = ["output", "id", "priority", "revision", "validFrom", "validThrough", "status"] as const;
export type BomSort = (typeof BOM_SORTS)[number];

export const bomSortSchema = listSortSchema(BOM_SORTS);
