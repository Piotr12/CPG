import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { orderCreateSchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { purchaseOrderApiQuerySchema } from "@cpg/core/validators/purchasing/purchase-order-list.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/purchase-orders">;

/**
 * A page of the tenant's purchase orders with their lines, by ID, 100 to a page (`?page=2`; the first
 * when absent, a page past the last is empty), searched and sorted by the optional `q`, `sort` and `dir` as
 * the Purchase orders screen lists them (#221). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const query = parseInput(purchaseOrderApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return cradle.purchaseOrderService.list(query);
});

/**
 * Creates an Open order with the tenant's next ID, converting the requisitions its lines name
 * (R07, BUY-002, BUY-003). Any account with a token may.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.purchaseOrderService.create(parseInput(orderCreateSchema, body), apiActor(caller)),
);
