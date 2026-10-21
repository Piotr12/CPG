import { apiActor, parseInput } from "@cpg/core";
import { purchaseOrderLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/** Resolve this document's remainder at the version read by the caller. */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/purchase-orders/[id]/cancel">>) => {
  const input = parseInput(purchaseOrderLifecycleSchema, body);
  return cradle.purchaseOrderService.cancel((await context.params).id, input.version, apiActor(caller), input.lines);
});
