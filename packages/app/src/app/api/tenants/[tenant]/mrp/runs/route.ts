import { apiActor, parseInput } from "@cpg/core";
import { mrpRunSchema } from "@cpg/core/validators/mrp/mrp-run.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";

/**
 * Runs MRP for every location of the tenant and stores the run (E14-S02, R07). Both roles may; the
 * shared gate enforces the bearer token, the key, Test's generation and the read-only flag, for the
 * admin too (RUN-021, TEN-019). The body is empty or `{}`.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/mrp/runs">>) => {
  parseInput(mrpRunSchema, body);
  return cradle.mrpRunService.run(apiActor(caller));
});
