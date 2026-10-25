import { listQueryShape, listSortSchema } from "../lists/list-query.schema";
import { customerOrderListSchema } from "./customer-order.schema";

/**
 * The columns the Customer orders list sorts by (#217); the first is its default order. A customer or
 * location sorts by its business ID. The line count is computed, so it isn't one.
 */
export const CUSTOMER_ORDER_SORTS = ["id", "customer", "location", "status"] as const;
export type CustomerOrderSort = (typeof CUSTOMER_ORDER_SORTS)[number];

export const customerOrderSortSchema = listSortSchema(CUSTOMER_ORDER_SORTS);

/** `GET /api/tenants/{tenant}/customer-orders`'s query (#221): an optional search and sort besides its `page`; another key is still 400. */
export const customerOrderApiQuerySchema = customerOrderListSchema.extend(listQueryShape(CUSTOMER_ORDER_SORTS));
