import { apiHandler, tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../auth/require-api-user";

/**
 * One tenant's metadata. Every tenant-scoped endpoint lives under /api/tenants/{tenant}/ and runs in
 * that tenant's scope (API-013); anything but `test` or `prod` is 404 `TENANT_NOT_FOUND`.
 */
export const GET = apiHandler(async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]">) => {
  await requireApiUser(request);
  return (await tenantScope((await params).tenant)).cradle.tenant;
});
