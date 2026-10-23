import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Customer } from "../customers/customer.entity";
import { Location } from "../locations/location.entity";
import { tenantOwned } from "../tenants/tenant-owned";

export const DOCUMENT_STATES = ["open", "completed", "closed-early", "cancelled"] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];
const owned = tenantOwned();

/** One tenant's customer demand aggregate; only actual goods issues fulfil its lines. */
export const CustomerOrder = defineEntity({
  name: "CustomerOrder",
  filters: owned.filters,
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    tenant: owned.tenant,
    code: p.string().length(8),
    customer: () => p.manyToOne(Customer).index(),
    location: () => p.manyToOne(Location).index(),
    status: p.enum(DOCUMENT_STATES).default("open"),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
  uniques: [{ properties: ["tenant", "code"] }],
  /** Serves the location-deactivation guard: the lowest Open order at a location. */
  indexes: [{ properties: ["tenant", "location", "status", "code"] }],
});
export type CustomerOrder = InferEntity<typeof CustomerOrder>;
