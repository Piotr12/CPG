import { apiActor, parseInput } from "@cpg/core";
import { transferPostingSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/**
 * Dispatches part or all of what is left: stock leaves the source into transit today, in one
 * transaction (TRF-004, TRF-005, AUD-019). More than the source holds is 409 `INSUFFICIENT_STOCK`
 * (TRF-008), more than is left 409 `TRANSFER_OVER_DISPATCH`. Returns `{ transfer, posting }`.
 */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/transfers/[id]/dispatches">>) =>
  cradle.transferService.dispatch((await context.params).id, parseInput(transferPostingSchema, body), apiActor(caller)),
);
