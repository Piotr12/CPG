import { apiActor, parseInput } from "@cpg/core";
import { mrpProposalAcceptSchema } from "@cpg/core/validators/mrp/mrp-proposal-accept.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/mrp/runs/[run]/proposals/[proposal]/accept">;

/**
 * Accepts one proposal of the tenant's latest MRP run (E19-S01, R07): a Buy proposal becomes an Open
 * purchase requisition and a Make proposal an Open production order pinned to its BOM revision (#320),
 * each tagged with the run, after it is planned again. Both roles may; the shared gate
 * enforces the bearer token, the key, Test's generation and the read-only flag, for the admin too. A
 * replay with the first key answers the first result. The body is empty or `{}`; `{proposal}` is the
 * ID the latest-run read gives each proposal.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle, context }: WriteContext<Context>) => {
  parseInput(mrpProposalAcceptSchema, body);
  const { run, proposal } = await context.params;
  return cradle.mrpAcceptanceService.accept(run, proposal, apiActor(caller));
});
