import { defineEntity, p, type InferEntity } from "@mikro-orm/core";

/** The two business datasets (R05). Fixed by the PRD: no tenant is created or deleted at runtime. */
export const TENANT_CODES = ["test", "prod"] as const;
export type TenantCode = (typeof TENANT_CODES)[number];

/**
 * A business dataset. Both rows are inserted by the `tenants` migration, so a fresh install has
 * them before the first request. Keyed by its code (a small configuration table, like `Setting`).
 */
export const Tenant = defineEntity({
  name: "Tenant",
  properties: {
    code: p.enum(TENANT_CODES).primary(),
    /** Dataset generation: changes only when the Test reset (slice 2) regenerates Test. */
    generation: p.integer().default(1),
    /**
     * Set by the admin: while true, nothing may change this tenant's business data, the admin's and
     * the API's writes included (R05). Global work (accounts, tokens, preferences, this flag) goes on.
     */
    readOnly: p.boolean().default(false),
  },
});

export type Tenant = InferEntity<typeof Tenant>;
