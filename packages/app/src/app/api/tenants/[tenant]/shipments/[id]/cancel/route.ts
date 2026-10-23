import { apiActor, parseInput } from "@cpg/core";
import { documentLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/** Cancels an Open shipment nothing was ever issued against, at the version the caller read (shipment edit spec Q6). */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/shipments/[id]/cancel">>) => {
  const { version } = parseInput(documentLifecycleSchema, body);
  return cradle.shipmentService.cancel((await context.params).id, version, apiActor(caller));
});
