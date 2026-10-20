import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { transferUpdateBodySchema } from "@cpg/core/validators/transfers/transfer.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/transfers/[id]">;

/** One transfer with its newest postings and their legs (TRF-024); 404 `TRANSFER_NOT_FOUND` for an ID this tenant doesn't have. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.transferService.get(id);
});

/**
 * Sets both planned dates, arrival not before dispatch, at the version the client loaded (409
 * `VERSION_CONFLICT`, TRF-026). The material, locations, quantity and unit are refused, not ignored.
 */
export const PATCH = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<Context>) => {
  const { version, plannedDispatch, plannedArrival } = parseInput(transferUpdateBodySchema, body);
  return cradle.transferService.setPlannedDates((await context.params).id, { plannedDispatch, plannedArrival }, version, apiActor(caller));
});
