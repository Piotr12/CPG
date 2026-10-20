import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { bomCreateBodySchema } from "@cpg/core/validators/boms/bom-create.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/boms">;

/** The tenant's BOMs with their current recipes, as the BOMs screen lists them. Any signed-in account. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.bomService.list();
});

/**
 * Creates a BOM with revision 1 and the tenant's next BOM ID, as the Create BOM form does (R07,
 * BOM-001). Admin only, checked before the key and the body (API-010).
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) =>
    cradle.bomService.create(parseInput(bomCreateBodySchema, body), apiActor(caller)),
  { authorize: assertAdmin },
);
