"use server";

import { assertAdmin, tenantServerAction, uiActor, type NamedRecordView, type Result } from "@cpg/core";
import { namedRecordCreateSchema } from "@cpg/core/validators/named-records/named-record-create.schema";
import { namedRecordUpdateSchema } from "@cpg/core/validators/named-records/named-record-update.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The customers screen's writes, bound by the page to the tenant and dataset generation it rendered
 * (`tenantServerAction`), and for an update to the row's ID and version. Admin only (master data,
 * TEN-004): the session is read before the write's transaction opens and checked with `assertAdmin`
 * inside, after parsing. Each refreshes the list after a success or a stale version.
 */

/** Creates a customer with the tenant's next customer ID (spec Q2). */
export async function createCustomer(tenant: string, generation: number, values: unknown): Promise<Result<NamedRecordView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(namedRecordCreateSchema, (input, { cradle }) =>
    cradle.customerService.create(input, uiActor(assertAdmin(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/customers`);
}

/** Renames and/or (de)activates a customer at the version the page loaded (AUD-024). */
export async function updateCustomer(
  tenant: string,
  generation: number,
  id: string,
  version: number,
  values: unknown,
): Promise<Result<NamedRecordView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(namedRecordUpdateSchema, ({ recordId, version, ...changes }, { cradle }) =>
    cradle.customerService.update(recordId, changes, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...formValues(values), recordId: id, version });
  return refreshAfterWrite(result, `/admin/${tenant}/customers`);
}
