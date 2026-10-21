import { apiActor } from "@cpg/core";
import { tenantApiWrite, type WriteContext } from "../../../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/transfers/[id]/postings/[postingId]/reverse">;

/** Reverses one dispatch, receipt or write-off (E11-S03) under the shared key/generation/read-only gate; the service validates the strict body. */
export const POST = tenantApiWrite(async ({ caller, body, cradle, context }: WriteContext<Context>) => {
  const { id, postingId } = await context.params;
  return cradle.transferService.reverse(id, postingId, body, apiActor(caller));
});
