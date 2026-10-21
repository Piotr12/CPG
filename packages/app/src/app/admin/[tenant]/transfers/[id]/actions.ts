"use server";

import { assertSignedIn, tenantServerAction, uiActor, type PostedTransferView, type Result, type TransferView } from "@cpg/core";
import { transferDatesSchema, transferPostingSchema, transferWriteOffSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { documentLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { currentUser } from "../../../../../auth/require-admin";
import { refreshAfterWrite } from "../../../../../routing/refresh-after-write";

/*
 * The transfer page's writes. Each is bound by its page to the tenant and dataset generation it
 * rendered (`tenantServerAction`) and to the transfer it shows; a date edit also to the version it
 * loaded. Any signed-in account may write (spec Q11): the session is read before the write's
 * transaction opens and checked with `assertSignedIn` inside, after parsing.
 */

/** The pages a posting changes: the transfer, the list's quantities and the stock page's balances. */
const postedPaths = (tenant: string, id: string) => [`/admin/${tenant}/transfers/${id}`, `/admin/${tenant}/transfers`, `/admin/${tenant}/stock`];

/** Dispatches from the page's transfer: stock leaves the source into transit (TRF-004). */
export async function dispatchTransfer(tenant: string, generation: number, id: string, values: unknown): Promise<Result<PostedTransferView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(transferPostingSchema, (input, { cradle }) =>
    cradle.transferService.dispatch(id, input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, ...postedPaths(tenant, id));
}

/** Receives on the page's transfer: stock leaves transit onto the destination (TRF-006). */
export async function receiveTransfer(tenant: string, generation: number, id: string, values: unknown): Promise<Result<PostedTransferView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(transferPostingSchema, (input, { cradle }) =>
    cradle.transferService.receive(id, input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, ...postedPaths(tenant, id));
}

/** Writes off lost transit on the page's transfer, with its reason (TRF-013). */
export async function writeOffTransfer(tenant: string, generation: number, id: string, values: unknown): Promise<Result<PostedTransferView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(transferWriteOffSchema, (input, { cradle }) =>
    cradle.transferService.writeOff(id, input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, ...postedPaths(tenant, id));
}

/** New planned dates for the page's transfer, at the version the page loaded (TRF-026). */
export async function setTransferDates(tenant: string, generation: number, id: string, version: number, values: unknown): Promise<Result<TransferView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(transferDatesSchema, (input, { cradle }) =>
    cradle.transferService.setPlannedDates(id, input, version, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/transfers/${id}`, `/admin/${tenant}/transfers`);
}

/** Resolves the remainder using the version captured by the confirmation. */
export async function cancelTransfer(tenant: string, generation: number, id: string, values: unknown): Promise<Result<TransferView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(documentLifecycleSchema, (input, { cradle }) =>
    cradle.transferService.cancel(id, input.version, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/transfers`, `/admin/${tenant}/transfers/${id}`);
}

/** Resolves the remainder using the version captured by the confirmation. */
export async function closeEarlyTransfer(tenant: string, generation: number, id: string, values: unknown): Promise<Result<TransferView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(documentLifecycleSchema, (input, { cradle }) =>
    cradle.transferService.closeEarly(id, input.version, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/transfers`, `/admin/${tenant}/transfers/${id}`);
}
