import { tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/shipments/[id]">;

/** One shipment with its lines; 404 `SHIPMENT_NOT_FOUND` for an ID this tenant doesn't have. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.shipmentService.get(id);
});
