import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { requisitionUpdateBodySchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/purchase-requisitions/[id]">;

/** One requisition; 404 `REQUISITION_NOT_FOUND` for an ID this tenant doesn't have. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.purchaseRequisitionService.get(id);
});

/**
 * Sets the required date at the version the client loaded (409 `VERSION_CONFLICT`, API-029); the
 * material, location and quantity are refused, not ignored. Any account with a token.
 */
export const PATCH = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<Context>) => {
  const { version, requiredDate } = parseInput(requisitionUpdateBodySchema, body);
  return cradle.purchaseRequisitionService.setRequiredDate((await context.params).id, requiredDate, version, apiActor(caller));
});
