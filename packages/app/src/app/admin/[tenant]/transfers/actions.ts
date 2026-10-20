"use server";

import { assertSignedIn, tenantServerAction, uiActor, type Result, type TransferView } from "@cpg/core";
import { transferCreateSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { currentUser } from "../../../../auth/require-admin";
import { refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The Transfers screen's write. It is bound by its page to the tenant and dataset generation it
 * rendered (`tenantServerAction`). Any signed-in account may create (spec Q11): the session is read
 * before the write's transaction opens and checked with `assertSignedIn` inside, after parsing.
 */

/** Creates an Open transfer with the tenant's next ID and nothing moved (TRF-001, TRF-003, LFC-001). */
export async function createTransfer(tenant: string, generation: number, values: unknown): Promise<Result<TransferView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(transferCreateSchema, (input, { cradle }) =>
    cradle.transferService.create(input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/transfers`);
}
