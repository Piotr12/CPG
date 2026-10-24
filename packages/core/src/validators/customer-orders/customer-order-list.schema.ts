import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the Customer orders list sorts by (#217); the first is its default order. A customer or
 * location sorts by its business ID. The line count is computed, so it isn't one.
 */
export const CUSTOMER_ORDER_SORTS = ["id", "customer", "location", "status"] as const;
export type CustomerOrderSort = (typeof CUSTOMER_ORDER_SORTS)[number];

export const customerOrderSortSchema = listSortSchema(CUSTOMER_ORDER_SORTS);
