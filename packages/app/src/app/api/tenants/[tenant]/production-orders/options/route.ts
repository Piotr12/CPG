import { parseInput, tenantScope } from "@cpg/core";
import { productionOrderOptionsSchema } from "@cpg/core/validators/production-orders/production-order.schema";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/production-orders/options">;
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const input = parseInput(productionOrderOptionsSchema, Object.fromEntries(new URL(request.url).searchParams));
  return (await tenantScope((await params).tenant)).cradle.productionOrderService.options(input);
});
