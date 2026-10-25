import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Material, MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { CustomerOrder, DOCUMENT_STATES } from "./customer-order.entity";

const owned = tenantOwned();

/** Stable line identity and historical conversion. Location is inherited from the header (SAL-004). */
export const CustomerOrderLine = defineEntity({
  name: "CustomerOrderLine",
  filters: owned.filters,
  /** The material guards' lookup, then the demand review's window read by required date (#240). */
  indexes: [{ properties: ["tenant", "material", "removed", "status", "id"] }, { properties: ["tenant", "requiredDate"] }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    order: () => p.manyToOne(CustomerOrder).index(),
    position: p.integer(),
    /** Removed unposted lines stay as historical references, locking material type/base unit. */
    removed: p.boolean().default(false),
    material: () => p.manyToOne(Material).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    requiredDate: p.string().length(10),
    fulfilled: p.string().default("0.000000"),
    abandoned: p.string().default("0.000000"),
    status: p.enum(DOCUMENT_STATES).default("open"),
  },
});
export type CustomerOrderLine = InferEntity<typeof CustomerOrderLine>;
