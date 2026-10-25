import { listQueryShape, listSortSchema } from "../lists/list-query.schema";
import { purchaseOrderListQuerySchema } from "./purchase-order.schema";

/**
 * The columns the Purchase orders list sorts by (#217); the first is its default order. An order has
 * no business date of its own, so it sorts by when it was created (#224).
 */
export const PURCHASE_ORDER_SORTS = ["id", "supplier", "location", "created", "status"] as const;
export type PurchaseOrderSort = (typeof PURCHASE_ORDER_SORTS)[number];

export const purchaseOrderSortSchema = listSortSchema(PURCHASE_ORDER_SORTS);

/** `GET /api/tenants/{tenant}/purchase-orders`'s query (#221): an optional search and sort besides its `page`; other keys are ignored, as before. */
export const purchaseOrderApiQuerySchema = purchaseOrderListQuerySchema.extend(listQueryShape(PURCHASE_ORDER_SORTS));
