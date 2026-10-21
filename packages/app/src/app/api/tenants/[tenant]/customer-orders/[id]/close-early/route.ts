import { apiActor, parseInput } from "@cpg/core";
import { customerOrderLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/** Resolve this document's remainder at the version read by the caller. */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/customer-orders/[id]/close-early">>) => {
  const input = parseInput(customerOrderLifecycleSchema, body);
  return cradle.customerOrderService.closeEarly((await context.params).id, input.version, apiActor(caller), input.lines);
});
