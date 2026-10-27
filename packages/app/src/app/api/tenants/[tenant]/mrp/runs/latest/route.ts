import { tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../../routing/api-handler";

/**
 * The tenant's latest MRP run and one page of its daily results (E14-S02, RUN-002): `page` of 25
 * material-location pairs, and `run` and `generation`, the run a client paged from, refused once a newer
 * run replaced it.
 * Any signed-in account, on a read-only tenant too: it writes nothing (RUN-021, TEN-018).
 */
export const GET = apiHandler(async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]/mrp/runs/latest">) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.mrpRunService.latest(Object.fromEntries(new URL(request.url).searchParams));
});
