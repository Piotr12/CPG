import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { requisitionCreateSchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/purchase-requisitions">;

/** The tenant's purchase requisitions, as the Purchase requisitions screen lists them. Any signed-in account. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.purchaseRequisitionService.list();
});

/**
 * Creates an Open requisition with the tenant's next ID and nothing converted (R07, LFC-001). Any
 * account with a token may: unlike master data, procurement documents aren't admin-only.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.purchaseRequisitionService.create(parseInput(requisitionCreateSchema, body), apiActor(caller)),
);
