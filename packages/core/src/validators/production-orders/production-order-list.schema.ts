import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the Production orders list sorts by (#217); the first is its default order. The output
 * and location sort by their business IDs, the quantity by its value (#224); the BOM is a revision
 * pair, so it isn't one.
 */
export const PRODUCTION_ORDER_SORTS = ["id", "output", "quantity", "location", "finish", "start", "status"] as const;
export type ProductionOrderSort = (typeof PRODUCTION_ORDER_SORTS)[number];

export const productionOrderSortSchema = listSortSchema(PRODUCTION_ORDER_SORTS);
