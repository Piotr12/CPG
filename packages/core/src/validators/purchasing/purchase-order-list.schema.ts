import { listSortSchema } from "../lists/list-query.schema";

/** The columns the Purchase orders list sorts by (#217); the first is its default order. */
export const PURCHASE_ORDER_SORTS = ["id", "supplier", "location", "status"] as const;
export type PurchaseOrderSort = (typeof PURCHASE_ORDER_SORTS)[number];

export const purchaseOrderSortSchema = listSortSchema(PURCHASE_ORDER_SORTS);
