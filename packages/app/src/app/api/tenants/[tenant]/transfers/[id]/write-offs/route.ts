import { apiActor, parseInput } from "@cpg/core";
import { transferWriteOffSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

/**
 * Writes off a lost part of what is in transit, with its reason (TRF-013): no location changes. More
 * than is in transit is 409 `TRANSFER_OVER_WRITE_OFF`. Returns `{ transfer, posting }`.
 */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/transfers/[id]/write-offs">>) =>
  cradle.transferService.writeOff((await context.params).id, parseInput(transferWriteOffSchema, body), apiActor(caller)),
);
