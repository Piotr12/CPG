import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { planningParameterApiQuerySchema } from "@cpg/core/validators/planning-parameters/planning-parameter-list.schema";
import { planningParameterCreateSchema } from "@cpg/core/validators/planning-parameters/planning-parameter-create.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/planning-parameters">;

/**
 * The tenant's planning parameter sets by material, then location, or by the optional `sort`/`dir`,
 * narrowed by the optional search `q`, as the screen lists them (#221). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const query = parseInput(planningParameterApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.planningParameterService.list(query);
});

/**
 * Adds a material's parameter set at a location, as the Add parameters form does (R07, MAT-016):
 * quantities are base-unit strings and the lead time a whole number of days. Admin only, checked
 * before the key and the body (API-010).
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) =>
    cradle.planningParameterService.create(parseInput(planningParameterCreateSchema, body), apiActor(caller)),
  { authorize: assertAdmin },
);
