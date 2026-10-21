"use server";

import { assertSignedIn, tenantServerAction, uiActor, type RequisitionView, type Result } from "@cpg/core";
import { requisitionCreateSchema, requisitionDateSchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { documentLifecycleSchema } from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { currentUser } from "../../../../auth/require-admin";
import { refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The requisition screen's writes. Each is bound by its page to the tenant and dataset generation it
 * rendered (`tenantServerAction`); a row's write also to its requisition, and a date edit to the
 * version its dialog opened with. Any signed-in account may create (spec Q7): the session is read
 * before the write's transaction opens and checked with `assertSignedIn` inside, after parsing.
 */

/** Creates an Open requisition with the tenant's next ID and nothing converted (LFC-001). */
export async function createRequisition(tenant: string, generation: number, values: unknown): Promise<Result<RequisitionView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(requisitionCreateSchema, (input, { cradle }) =>
    cradle.purchaseRequisitionService.create(input, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/purchase-requisitions`);
}

/** A row's new required date, at the version its dialog opened with (spec 2026-10-21--2036UTC-purchasing-date-edits). */
export async function setRequisitionRequiredDate(tenant: string, generation: number, id: string, version: number, values: unknown): Promise<Result<RequisitionView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(requisitionDateSchema, (input, { cradle }) =>
    cradle.purchaseRequisitionService.setRequiredDate(id, input.requiredDate, version, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/purchase-requisitions`);
}

/** Resolves the remainder using the version captured by the confirmation. */
export async function cancelRequisition(tenant: string, generation: number, id: string, values: unknown): Promise<Result<RequisitionView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(documentLifecycleSchema, (input, { cradle }) =>
    cradle.purchaseRequisitionService.cancel(id, input.version, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/purchase-requisitions`);
}

/** Resolves the remainder using the version captured by the confirmation. */
export async function closeEarlyRequisition(tenant: string, generation: number, id: string, values: unknown): Promise<Result<RequisitionView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(documentLifecycleSchema, (input, { cradle }) =>
    cradle.purchaseRequisitionService.closeEarly(id, input.version, uiActor(assertSignedIn(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/purchase-requisitions`);
}
