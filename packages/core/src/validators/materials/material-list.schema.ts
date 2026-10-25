import { z } from "zod";
import { listQueryShape, listSortSchema } from "../lists/list-query.schema";

/** The columns the Materials list sorts by (#217); the first is its default order. */
export const MATERIAL_SORTS = ["id", "description", "type", "baseUnit", "status"] as const;
export type MaterialSort = (typeof MATERIAL_SORTS)[number];

export const materialSortSchema = listSortSchema(MATERIAL_SORTS);

/** `GET /api/tenants/{tenant}/materials`'s query (#221): an optional search and sort; other keys are ignored, as before. */
export const materialApiQuerySchema = z.object(listQueryShape(MATERIAL_SORTS));
