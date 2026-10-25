import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { productionOrderCreateSchema } from "@cpg/core/validators/production-orders/production-order.schema";
import { productionOrderApiQuerySchema } from "@cpg/core/validators/production-orders/production-order-list.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/production-orders">;

/** A page of the tenant's production orders, searched and sorted by the optional `q`, `sort` and `dir` (#221). Any signed-in account. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const query = parseInput(productionOrderApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.productionOrderService.list(query);
});
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.productionOrderService.create(parseInput(productionOrderCreateSchema, body), apiActor(caller)),
);
