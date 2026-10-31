import { tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../../routing/api-handler";

/**
 * The last MRP report (E14-S02, E18-S01, RUN-002, UX-021): the tenant's latest MRP run and one page of
 * its daily results, as the MRP page shows them. `material` and `location` filter the pairs, `page`
 * takes 25 of them, and `run` and `generation`, the run a client paged from, are refused once a newer
 * run replaced it. Any signed-in account, on a read-only tenant too: it writes nothing (RUN-021, TEN-018).
 */
export const GET = apiHandler(async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]/mrp/runs/latest">) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.mrpRunService.latest(Object.fromEntries(new URL(request.url).searchParams));
});
