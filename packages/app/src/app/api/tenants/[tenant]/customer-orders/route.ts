import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { customerOrderCreateSchema, customerOrderListSchema } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/customer-orders">;

/** Both roles read their chosen tenant's orders. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const { page } = parseInput(customerOrderListSchema, Object.fromEntries(new URL(request.url).searchParams));
  return cradle.customerOrderService.list({ page });
});

/** Keyed, generation-checked order entry for either role; no stock posting. */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.customerOrderService.create(parseInput(customerOrderCreateSchema, body), apiActor(caller)),
);
