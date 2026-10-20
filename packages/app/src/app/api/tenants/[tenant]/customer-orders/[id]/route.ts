import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { customerOrderUpdateSchema } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/customer-orders/[id]">;

/** Unknown or other-tenant order IDs are not found. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.customerOrderService.get(id);
});

/** A full aggregate update under the version the caller read. */
export const PATCH = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<Context>) => {
  const { version, ...changes } = parseInput(customerOrderUpdateSchema, body);
  return cradle.customerOrderService.update((await context.params).id, changes, version, apiActor(caller));
});
