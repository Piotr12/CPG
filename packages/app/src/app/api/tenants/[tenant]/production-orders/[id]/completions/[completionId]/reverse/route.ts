import { apiActor } from "@cpg/core";
import { tenantApiWrite, type WriteContext } from "../../../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/production-orders/[id]/completions/[completionId]/reverse">;

/** Reverses one whole completion (E11-S03) under the shared key/generation/read-only gate; the service validates the strict body. */
export const POST = tenantApiWrite(async ({ caller, body, cradle, context }: WriteContext<Context>) => {
  const { id, completionId } = await context.params;
  return cradle.productionCompletionService.reverse(id, completionId, body, apiActor(caller));
});
