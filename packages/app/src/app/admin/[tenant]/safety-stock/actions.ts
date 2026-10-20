"use server";

import { assertAdmin, tenantServerAction, uiActor, type Result, type SafetyStockTargetKey, type SafetyStockTargetView } from "@cpg/core";
import {
  safetyStockTargetChangeSchema,
  safetyStockTargetCreateSchema,
  safetyStockTargetRemoveSchema,
} from "@cpg/core/validators/safety-stock/safety-stock-target.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The safety stock screen's writes, bound by the page to the tenant and dataset generation it
 * rendered (`tenantServerAction`), and for a change or removal to the target's key and version.
 * Admin only (TEN-004), checked with `assertAdmin` inside the write's transaction. Each refreshes the
 * list after a success or a stale version.
 */

/** Adds a target from a date (DEM-015); a second one on the same date is refused (DEM-017). */
export async function addSafetyStockTarget(
  tenant: string,
  generation: number,
  values: unknown,
): Promise<Result<SafetyStockTargetView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(safetyStockTargetCreateSchema, (input, { cradle }) =>
    cradle.safetyStockTargetService.create(input, uiActor(assertAdmin(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/safety-stock`);
}

/** Sets a target's quantity at the version the page loaded (AUD-024). */
export async function changeSafetyStockTarget(
  tenant: string,
  generation: number,
  key: SafetyStockTargetKey,
  version: number,
  values: unknown,
): Promise<Result<SafetyStockTargetView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(safetyStockTargetChangeSchema, ({ quantity, version, ...target }, { cradle }) =>
    cradle.safetyStockTargetService.update(target, quantity, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...formValues(values), ...key, version });
  return refreshAfterWrite(result, `/admin/${tenant}/safety-stock`);
}

/** Removes a target at the version the page loaded. */
export async function removeSafetyStockTarget(
  tenant: string,
  generation: number,
  key: SafetyStockTargetKey,
  version: number,
): Promise<Result<SafetyStockTargetKey>> {
  const actor = await currentUser();
  const result = await tenantServerAction(safetyStockTargetRemoveSchema, ({ version, ...target }, { cradle }) =>
    cradle.safetyStockTargetService.remove(target, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...key, version });
  return refreshAfterWrite(result, `/admin/${tenant}/safety-stock`);
}
