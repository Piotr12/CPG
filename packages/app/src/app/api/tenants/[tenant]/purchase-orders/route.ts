import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { orderCreateSchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/purchase-orders">;

/** The tenant's purchase orders with their lines, as the Purchase orders screen lists them. Any signed-in account. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.purchaseOrderService.list();
});

/**
 * Creates an Open order with the tenant's next ID, converting the requisitions its lines name
 * (R07, BUY-002, BUY-003). Any account with a token may.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.purchaseOrderService.create(parseInput(orderCreateSchema, body), apiActor(caller)),
);
