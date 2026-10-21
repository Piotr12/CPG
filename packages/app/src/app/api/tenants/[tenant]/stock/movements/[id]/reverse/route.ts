import { apiActor } from "@cpg/core";
import { tenantApiWrite, type WriteContext } from "../../../../../../../../auth/api-write";

/** Both roles use the shared atomic key/generation/read-only gate. The service validates the strict body. */
export const POST = tenantApiWrite(async ({ caller, body, cradle, context }: WriteContext<RouteContext<"/api/tenants/[tenant]/stock/movements/[id]/reverse">>) =>
  cradle.stockReversalService.reverse((await context.params).id, body, apiActor(caller)),
);
