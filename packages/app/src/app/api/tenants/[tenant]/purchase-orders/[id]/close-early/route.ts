import { apiActor, parseInput } from "@cpg/core";
import { purchaseOrderLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/** Resolve this document's remainder at the version read by the caller. */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/purchase-orders/[id]/close-early">>) => {
  const input = parseInput(purchaseOrderLifecycleSchema, body);
  return cradle.purchaseOrderService.closeEarly((await context.params).id, input.version, apiActor(caller), input.lines);
});
