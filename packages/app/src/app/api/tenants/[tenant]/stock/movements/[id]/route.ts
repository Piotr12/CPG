import { tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../../routing/api-handler";

/** Authenticated movement detail, including immutable original/inverse navigation. */
export const GET = apiHandler(async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]/stock/movements/[id]">) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.stockService.getMovement(id);
});
