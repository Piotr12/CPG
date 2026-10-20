import { apiActor, parseInput } from "@cpg/core";
import { transferPostingSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/**
 * Receives part or all of what is in transit: stock lands at the destination today, in one
 * transaction (TRF-006, AUD-020). More than is in transit is 409 `TRANSFER_OVER_RECEIPT` (TRF-007).
 * Returns `{ transfer, posting }`; the last receipt of the planned quantity completes the transfer.
 */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/transfers/[id]/receipts">>) =>
  cradle.transferService.receive((await context.params).id, parseInput(transferPostingSchema, body), apiActor(caller)),
);
