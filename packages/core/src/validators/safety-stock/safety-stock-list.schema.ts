import { z } from "zod";
import { listQueryShape, listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the safety stock list sorts by (#217); the first, the material's ID (then the
 * location's and the date), is its default order. The target quantity is decimal text, so it isn't
 * sortable (D3); the status is where a target stands today, in time order.
 */
export const SAFETY_STOCK_SORTS = ["material", "location", "effectiveFrom", "status"] as const;
export type SafetyStockSort = (typeof SAFETY_STOCK_SORTS)[number];

export const safetyStockSortSchema = listSortSchema(SAFETY_STOCK_SORTS);

/** `GET /api/tenants/{tenant}/safety-stock-targets`'s query (#221): an optional search and sort; other keys are ignored, as before. */
export const safetyStockApiQuerySchema = z.object(listQueryShape(SAFETY_STOCK_SORTS));
