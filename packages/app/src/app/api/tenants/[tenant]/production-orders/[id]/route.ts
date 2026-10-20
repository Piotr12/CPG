import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { productionOrderUpdateSchema } from "@cpg/core/validators/production-orders/production-order.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/production-orders/[id]">;
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  return (await tenantScope(tenant)).cradle.productionOrderService.get(id);
});
export const PATCH = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<Context>) => {
  const { version, ...changes } = parseInput(productionOrderUpdateSchema, body);
  return cradle.productionOrderService.update((await context.params).id, changes, version, apiActor(caller));
});
