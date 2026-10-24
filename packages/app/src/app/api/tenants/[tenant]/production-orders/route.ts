import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { productionOrderCreateSchema, productionOrderListSchema } from "@cpg/core/validators/production-orders/production-order.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/production-orders">;
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { page } = parseInput(productionOrderListSchema, Object.fromEntries(new URL(request.url).searchParams));
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.productionOrderService.list({ page });
});
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.productionOrderService.create(parseInput(productionOrderCreateSchema, body), apiActor(caller)),
);
