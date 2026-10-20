import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { orderUpdateBodySchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/purchase-orders/[id]">;

/** One order with its lines; 404 `PURCHASE_ORDER_NOT_FOUND` for an ID this tenant doesn't have. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.purchaseOrderService.get(id);
});

/**
 * Sets the planned dates of some lines, addressed by line number, at the version the client loaded
 * (409 `VERSION_CONFLICT`, API-029, BUY-024); the supplier and location are refused, not ignored.
 * Any account with a token.
 */
export const PATCH = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<Context>) => {
  const { version, lines } = parseInput(orderUpdateBodySchema, body);
  return cradle.purchaseOrderService.setPlannedDates((await context.params).id, lines, version, apiActor(caller));
});
