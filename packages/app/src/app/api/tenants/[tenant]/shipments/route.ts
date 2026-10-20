import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { shipmentCreateSchema, shipmentListQuerySchema } from "@cpg/core/validators/shipments/shipment.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/shipments">;

/**
 * The tenant's shipments with their lines, newest first; `?customerOrder=00000001` keeps one order's
 * (404 `CUSTOMER_ORDER_NOT_FOUND` for an order this tenant doesn't have). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const filter = parseInput(shipmentListQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return cradle.shipmentService.list(filter);
});

/**
 * Creates a shipment against one Open customer order (R07, SAL-006…009). It moves no stock: only its
 * goods issues do. Any account with a token may.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.shipmentService.create(parseInput(shipmentCreateSchema, body), apiActor(caller)),
);
