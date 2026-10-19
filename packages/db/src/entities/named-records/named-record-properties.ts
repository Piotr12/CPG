import { randomUUID } from "node:crypto";
import { p } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";

/** Longest name of a location, customer or supplier (spec Q3). */
export const NAMED_RECORD_NAME_MAX = 100;

/**
 * The shape shared by the masters that have only an ID, a name and an active flag: locations,
 * customers and suppliers (E03-S02). Spread into `defineEntity` so the three tables can't drift:
 *
 *     export const Location = defineEntity({ name: "Location", ...namedRecordDefinition() });
 *
 * Tenant-owned (R05). `code` is the business ID: eight digits assigned in sequence per tenant and per
 * kind from `00000001`, never changed or reused; the UUID never leaves `core`. Records are never
 * deleted, only deactivated.
 */
export function namedRecordDefinition() {
  const owned = tenantOwned();
  return {
    filters: owned.filters,
    properties: {
      id: p
        .uuid()
        .primary()
        .onCreate(() => randomUUID()),
      tenant: owned.tenant,
      code: p.string().length(8),
      name: p.string().length(NAMED_RECORD_NAME_MAX),
      active: p.boolean().default(true),
      createdAt: p.datetime().onCreate(() => new Date()),
      /** Optimistic-lock version (AUD-024, API-029): an edit carries the one it loaded. */
      version: p.integer().version(),
    },
    // Tenant-local business key: Test and Prod each have their own 00000001 (TEN-012).
    uniques: [{ properties: ["tenant", "code"] as ["tenant", "code"] }],
  };
}
