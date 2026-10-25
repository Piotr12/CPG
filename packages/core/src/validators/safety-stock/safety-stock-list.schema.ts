import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the safety stock list sorts by (#217); the first, the material's ID (then the
 * location's and the date), is its default order. The target quantity sorts by its value (#224); the
 * status is where a target stands today, in time order.
 */
export const SAFETY_STOCK_SORTS = ["material", "location", "effectiveFrom", "quantity", "status"] as const;
export type SafetyStockSort = (typeof SAFETY_STOCK_SORTS)[number];

export const safetyStockSortSchema = listSortSchema(SAFETY_STOCK_SORTS);
