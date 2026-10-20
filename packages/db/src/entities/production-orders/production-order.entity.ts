import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { BomRevision } from "../boms/bom-revision.entity";
import { DOCUMENT_STATES } from "../customer-orders/customer-order.entity";
import { Location } from "../locations/location.entity";
import { Material } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";

const owned = tenantOwned();
/** Manual planned supply: an immutable recipe reference, captured lead time and exact entered target. */
export const ProductionOrder = defineEntity({
  name: "ProductionOrder",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    output: () => p.manyToOne(Material),
    location: () => p.manyToOne(Location),
    recipe: () => p.manyToOne(BomRevision).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string(),
    numerator: p.string(),
    denominator: p.string(),
    plannedFinish: p.string().length(10),
    plannedStart: p.string().length(10),
    leadTimeDays: p.integer(),
    produced: p.string().default("0.000000"),
    abandoned: p.string().default("0.000000"),
    status: p.enum(DOCUMENT_STATES).default("open"),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
  uniques: [{ properties: ["tenant", "code"] }],
  indexes: [{ properties: ["tenant", "location", "status"] }, { properties: ["tenant", "output", "status"] }],
});
export type ProductionOrder = InferEntity<typeof ProductionOrder>;
