import { listQueryShape, listSortSchema } from "../lists/list-query.schema";
import { productionOrderListSchema } from "./production-order.schema";

/**
 * The columns the Production orders list sorts by (#217); the first is its default order. The output
 * and location sort by their business IDs; the quantity is six-decimal text and the BOM a revision
 * pair, so neither is one.
 */
export const PRODUCTION_ORDER_SORTS = ["id", "output", "location", "finish", "start", "status"] as const;
export type ProductionOrderSort = (typeof PRODUCTION_ORDER_SORTS)[number];

export const productionOrderSortSchema = listSortSchema(PRODUCTION_ORDER_SORTS);

/** `GET /api/tenants/{tenant}/production-orders`'s query (#221): an optional search and sort besides its `page`; another key is still 400. */
export const productionOrderApiQuerySchema = productionOrderListSchema.extend(listQueryShape(PRODUCTION_ORDER_SORTS));
