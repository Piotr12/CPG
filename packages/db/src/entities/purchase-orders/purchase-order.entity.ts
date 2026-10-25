import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Location } from "../locations/location.entity";
import { Supplier } from "../suppliers/supplier.entity";
import { DOCUMENT_STATES } from "../customer-orders/customer-order.entity";
import { listSortIndexes } from "../lists/list-sort-indexes";
import { tenantOwned } from "../tenants/tenant-owned";

/** The shared four-state lifecycle; header status follows the lines. */
export const PURCHASE_ORDER_STATUSES = DOCUMENT_STATES;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

const owned = tenantOwned();

/**
 * A commitment to one `supplier` to deliver the lines of this order to one `location` (E09-S01,
 * BUY-002, BUY-006, BUY-007). `code` is its business ID: eight digits, sequential per tenant, never
 * reused; orders are never deleted. Its lines are `PurchaseOrderLine`s. A purchase order is planned
 * supply only: it never touches stock (BUY-009).
 */
export const PurchaseOrder = defineEntity({
  name: "PurchaseOrder",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    supplier: () => p.manyToOne(Supplier).index(),
    location: () => p.manyToOne(Location),
    status: p.string().length(12).default("open"),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** Set whenever a line's date changes, so the order's version advances with its lines. */
    updatedAt: p.datetime().onCreate(() => new Date()),
    /** Optimistic-lock version (AUD-024, API-029): an edit of the order or any line advances it. */
    version: p.integer().version(),
  },
  uniques: [{ properties: ["tenant", "code"] }],
  /** Serves the location-deactivation guard: the lowest Open order delivering to a location, then the list's status sorts (#220). */
  indexes: [{ properties: ["tenant", "location", "status", "code"] }, ...listSortIndexes("purchase_order", ["status"])],
});

export type PurchaseOrder = InferEntity<typeof PurchaseOrder>;
