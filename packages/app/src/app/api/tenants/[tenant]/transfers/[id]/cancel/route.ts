import { apiActor, parseInput } from "@cpg/core";
import { documentLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/** Resolve this document's remainder at the version read by the caller. */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/transfers/[id]/cancel">>) => {
  const input = parseInput(documentLifecycleSchema, body);
  return cradle.transferService.cancel((await context.params).id, input.version, apiActor(caller));
});
