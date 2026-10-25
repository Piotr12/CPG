import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { safetyStockApiQuerySchema } from "@cpg/core/validators/safety-stock/safety-stock-list.schema";
import { safetyStockTargetCreateSchema } from "@cpg/core/validators/safety-stock/safety-stock-target.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/safety-stock-targets">;

/**
 * The tenant's safety-stock targets by material, location, then date, or by the optional `sort`/`dir`,
 * narrowed by the optional search `q` (#221). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const query = parseInput(safetyStockApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.safetyStockTargetService.list(query);
});

/**
 * Adds a target from a date (DEM-015), as the Add target form does (R07); a second one on the same
 * date is 409 `SAFETY_STOCK_TARGET_EXISTS` (DEM-017). Admin only, checked before the key and the body.
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) =>
    cradle.safetyStockTargetService.create(parseInput(safetyStockTargetCreateSchema, body), apiActor(caller)),
  { authorize: assertAdmin },
);
