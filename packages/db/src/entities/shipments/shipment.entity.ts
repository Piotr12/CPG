import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { CustomerOrder } from "../customer-orders/customer-order.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/**
 * A shipment is Open until none of its lines has anything left to issue (shipments spec Q8), or until
 * it is cancelled before any goods issue (shipment edit spec Q6). Completed and Cancelled are terminal
 * for its users; only a goods-issue reversal reopens a Completed one.
 */
export const SHIPMENT_STATUSES = ["open", "completed", "cancelled"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const owned = tenantOwned();

/**
 * A planned dispatch against one customer `order` (E08-S02, SAL-006…008), from the order's location,
 * on `plannedDate`. It moves no stock: only its goods issues do (SAL-009). `code` is its business ID:
 * eight digits, sequential per tenant, never reused. Its lines are `ShipmentLine`s, numbered from
 * `nextLine` on, so a removed line's number is never handed out again (shipment edit spec Q3).
 * `version` advances on every change its page shows; a writer that changes only lines touches
 * `updatedAt` so the row changes (spec Q5).
 */
export const Shipment = defineEntity({
  name: "Shipment",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    order: () => p.manyToOne(CustomerOrder).index(),
    plannedDate: p.string().length(10),
    status: p.enum(SHIPMENT_STATUSES).default("open"),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** The column default only serves rows written before this column existed, or by an older release. */
    updatedAt: p.datetime().onCreate(() => new Date()).default(0),
    /** The 0-based position the next added line takes; an older release's rows hold 0. */
    nextLine: p.integer().default(0),
    version: p.integer().version(),
  },
  uniques: [{ properties: ["tenant", "code"] }],
  indexes: [{ properties: ["tenant", "order", "code"] }],
});

export type Shipment = InferEntity<typeof Shipment>;
