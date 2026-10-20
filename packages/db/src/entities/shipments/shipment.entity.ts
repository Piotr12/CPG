import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { CustomerOrder } from "../customer-orders/customer-order.entity";
import { tenantOwned } from "../tenants/tenant-owned";

/** A shipment is Open until none of its lines has anything left to issue (shipments spec Q8). */
export const SHIPMENT_STATUSES = ["open", "completed"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const owned = tenantOwned();

/**
 * A planned dispatch against one customer `order` (E08-S02, SAL-006…008), from the order's location,
 * on `plannedDate`. It moves no stock: only its goods issues do (SAL-009). `code` is its business ID:
 * eight digits, sequential per tenant, never reused. Its lines are `ShipmentLine`s.
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
  },
  uniques: [{ properties: ["tenant", "code"] }],
});

export type Shipment = InferEntity<typeof Shipment>;
