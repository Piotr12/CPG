import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { idempotencyKeyProperties } from "./idempotency-key";

const owned = tenantOwned();

/**
 * The idempotency key of an API write to one tenant's data. Tenant-owned (R05): its stored response
 * holds that tenant's records, so it is isolated like them and goes with the Test reset (spec Q8).
 * The same key in the other tenant is a different key (API-024).
 */
export const TenantIdempotencyKey = defineEntity({
  name: "TenantIdempotencyKey",
  filters: owned.filters,
  properties: {
    ...idempotencyKeyProperties(),
    tenant: owned.tenant,
    /** The tenant's dataset generation the write was made in. */
    generation: p.integer(),
  },
  uniques: [{ properties: ["tenant", "userId", "key"] }],
  indexes: [{ properties: ["tenant", "createdAt"] }],
});

export type TenantIdempotencyKey = InferEntity<typeof TenantIdempotencyKey>;
