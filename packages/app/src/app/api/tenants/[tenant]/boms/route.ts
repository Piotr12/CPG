import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { bomApiQuerySchema } from "@cpg/core/validators/boms/bom-list.schema";
import { bomCreateBodySchema } from "@cpg/core/validators/boms/bom-create.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/boms">;

/**
 * The tenant's BOMs with their current recipes, in the optional `sort`/`dir` order and narrowed by the
 * optional search `q`, as the BOMs screen lists them (#221). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const query = parseInput(bomApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.bomService.list(query);
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
