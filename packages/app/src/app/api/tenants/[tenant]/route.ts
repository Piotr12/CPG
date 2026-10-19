import { apiActor, apiHandler, assertAdmin, parseInput, tenantCodeSchema, tenantNotFound, tenantScope } from "@cpg/core";
import { tenantReadOnlyBodySchema } from "@cpg/core/validators/tenants/tenant-read-only.schema";
import { apiWrite, type WriteContext } from "../../../../auth/api-write";
import { requireApiUser } from "../../../../auth/require-api-user";

type Context = RouteContext<"/api/tenants/[tenant]">;

/**
 * One tenant's metadata. Every tenant-scoped endpoint lives under /api/tenants/{tenant}/ and runs in
 * that tenant's scope (API-013); anything but `test` or `prod` is 404 `TENANT_NOT_FOUND`.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  return (await tenantScope((await params).tenant)).cradle.tenant;
});

/**
 * Makes the tenant read-only or writable again (R05), as the Read-only card on Cave control (/admin) does.
 * Admin only, checked before the key and the body. The flag is global metadata, not tenant data, so
 * this is the one write under /api/tenants/{tenant}/ keyed in the global store and without
 * `Dataset-Generation`, and it keeps working while the tenant is read-only. Recorded in the Global
 * audit (AUD-016); setting the current value changes nothing.
 */
export const PATCH = apiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const tenant = tenantCodeSchema.safeParse((await context.params).tenant);
    if (!tenant.success) throw tenantNotFound();
    const { readOnly } = parseInput(tenantReadOnlyBodySchema, body);
    return cradle.tenantService.setReadOnly(tenant.data, readOnly, apiActor(caller));
  },
  { authorize: assertAdmin },
);
