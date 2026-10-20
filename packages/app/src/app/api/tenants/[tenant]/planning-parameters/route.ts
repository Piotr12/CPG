import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { planningParameterCreateSchema } from "@cpg/core/validators/planning-parameters/planning-parameter-create.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/planning-parameters">;

/** The tenant's planning parameter sets by material, then location, as the screen lists them. Any signed-in account. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.planningParameterService.list();
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
