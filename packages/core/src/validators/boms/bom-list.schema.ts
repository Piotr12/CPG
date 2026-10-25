import { z } from "zod";
import { listQueryShape, listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the BOMs list sorts by (#217); the first, the output material's ID (then priority),
 * is its default order (BOM-008).
 */
export const BOM_SORTS = ["output", "id", "priority", "revision", "validFrom", "validThrough", "status"] as const;
export type BomSort = (typeof BOM_SORTS)[number];

export const bomSortSchema = listSortSchema(BOM_SORTS);

/** `GET /api/tenants/{tenant}/boms`'s query (#221): an optional search and sort; other keys are ignored, as before. */
export const bomApiQuerySchema = z.object(listQueryShape(BOM_SORTS));
