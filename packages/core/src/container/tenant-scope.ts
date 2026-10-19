import { selectTenant } from "@cpg/db";
import { asValue } from "awilix";
import { tenantNotFound } from "../services/tenants/tenant.service";
import { tenantCodeSchema } from "../validators/tenants/tenant-code.schema";
import { getContainer } from "./container";
import type { AppContainer } from "./cradle";

/**
 * A request scope for one tenant. The only place a tenant is selected: every tenant page, tenant
 * action and tenant route resolves its services from here, so tenant-owned data they read or write
 * is that tenant's only (R05). `code` comes from the URL or a bound action argument; anything but
 * `test` or `prod` (or a missing tenant row) is `TENANT_NOT_FOUND`.
 */
export async function tenantScope(code: string): Promise<AppContainer> {
  return scopeForTenant(await getContainer(), code);
}

/** `tenantScope` on a given container (exported for tests). */
export async function scopeForTenant(container: AppContainer, code: string): Promise<AppContainer> {
  const parsed = tenantCodeSchema.safeParse(code);
  if (!parsed.success) throw tenantNotFound();

  const scope = container.createScope();
  const tenant = await scope.cradle.tenantService.get(parsed.data);
  selectTenant(scope.cradle.em, tenant.code);
  scope.register({ tenant: asValue(tenant) });
  return scope;
}
