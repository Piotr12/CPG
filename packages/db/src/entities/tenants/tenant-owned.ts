import { p, type EntityManager, type EntityMetadata, type FilterQuery } from "@mikro-orm/core";
import { Tenant, type TenantCode } from "./tenant.entity";

/** Name of the filter that scopes every tenant-owned entity to the request's tenant. */
export const TENANT_FILTER = "tenant";

/** Raised when code reads or writes tenant-owned data outside its tenant. Always a programming error. */
export class TenantViolationError extends Error {
  constructor(message: string) {
    super(`Tenant violation: ${message}`);
    this.name = "TenantViolationError";
  }
}

interface TenantParams {
  code: TenantCode;
}

/** The tenant this EntityManager is scoped to, or undefined for a global (no-tenant) scope. */
export function currentTenant(em: Pick<EntityManager, "getFilterParams">): TenantCode | undefined {
  return (em.getFilterParams(TENANT_FILTER) as TenantParams | undefined)?.code;
}

/** Scopes an EntityManager (and every fork of it) to one tenant. Only `tenantScope` in core calls this. */
export function selectTenant(em: Pick<EntityManager, "setFilterParams">, code: TenantCode): void {
  em.setFilterParams(TENANT_FILTER, { code } satisfies TenantParams);
}

function requireTenant(em: Pick<EntityManager, "getFilterParams">, action: string): TenantCode {
  const code = currentTenant(em);
  if (!code) throw new TenantViolationError(`${action} tenant-owned data without a tenant scope`);
  return code;
}

/**
 * The tenant filter. It ignores per-call arguments (`args: false`) and reads the tenant from the
 * EntityManager it runs on, so a call can't pass `filters: { tenant: { code: "prod" } }` to peek at
 * another tenant, and a scope without a tenant can't read tenant-owned data at all (fail closed).
 */
const tenantFilter = {
  name: TENANT_FILTER,
  default: true,
  args: false,
  cond: (_args: unknown, type: "read" | "update" | "delete", em: EntityManager): FilterQuery<object> => ({
    tenant: requireTenant(em, type === "read" ? "read" : "change"),
  }),
};

/**
 * Makes an entity tenant-owned (R05): spread `filters` into `defineEntity` and use `tenant` as its
 * `tenant` property. The reference is filled from the scope's tenant on create, so services never
 * set it, and `TenantGuard` rejects any write that doesn't match the scope.
 *
 *     const owned = tenantOwned();
 *     export const Material = defineEntity({ name: "Material", filters: owned.filters,
 *       properties: { tenant: owned.tenant, ... } });
 */
export function tenantOwned() {
  return {
    filters: { [TENANT_FILTER]: tenantFilter },
    tenant: () =>
      p
        .manyToOne(Tenant)
        .index()
        .onCreate((_entity, em) => em.getReference(Tenant, requireTenant(em, "create"))),
  };
}

/** Whether an entity was declared with `tenantOwned()`. */
export function isTenantOwned(meta: Pick<EntityMetadata, "filters"> | undefined): boolean {
  return Boolean(meta?.filters?.[TENANT_FILTER]);
}
