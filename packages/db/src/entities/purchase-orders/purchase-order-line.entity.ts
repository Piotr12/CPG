import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Material, MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { PurchaseRequisition } from "../purchase-requisitions/purchase-requisition.entity";
import { DOCUMENT_STATES } from "../customer-orders/customer-order.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { PurchaseOrder } from "./purchase-order.entity";

/** Length of an ISO calendar date, `YYYY-MM-DD`. */
const CALENDAR_DATE_LENGTH = 10;

const owned = tenantOwned();

/**
 * One dated line of a purchase order (BUY-008): a `material` and a `quantity` (six-decimal base-unit
 * text, R03, with the entered quantity, unit and factor kept, MAT-019), planned for `plannedDate`.
 * `requisition` is the requisition this line converted, if any (BUY-003). `position` is the line's
 * 1-based number in the order. `received` is what goods receipts have brought in so far, in the same
 * form (E09-S02); it may exceed `quantity` (BUY-015). Only the planned date and `received` ever change
 * (BUY-022, BUY-024).
 */
export const PurchaseOrderLine = defineEntity({
  name: "PurchaseOrderLine",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    order: () => p.manyToOne(PurchaseOrder),
    position: p.integer(),
    material: () => p.manyToOne(Material).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    plannedDate: p.string().length(CALENDAR_DATE_LENGTH),
    requisition: () => p.manyToOne(PurchaseRequisition).nullable().index(),
    received: p.string().default("0.000000"),
    abandoned: p.string().default("0.000000"),
    status: p.enum(DOCUMENT_STATES).default("open"),
  },
  uniques: [{ properties: ["order", "position"] }],
  /** Serve a list page's line read, `order IN (…)`, which SQLite would plan through the tenant alone (#247). */
  indexes: [{ properties: ["tenant", "order"] }],
});

export type PurchaseOrderLine = InferEntity<typeof PurchaseOrderLine>;
