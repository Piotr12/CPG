import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { shipmentUpdateSchema } from "@cpg/core/validators/shipments/shipment.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
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

/** An Open shipment's new plan, its whole line set, under the version the caller read (shipment edit spec Q2). */
export const PATCH = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<Context>) => {
  const { version, ...changes } = parseInput(shipmentUpdateSchema, body);
  return cradle.shipmentService.update((await context.params).id, changes, version, apiActor(caller));
});
