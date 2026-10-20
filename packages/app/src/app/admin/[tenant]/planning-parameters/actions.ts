"use server";

import { assertAdmin, tenantServerAction, uiActor, type PlanningParameterView, type Result } from "@cpg/core";
import {
  planningParameterChangeSchema,
  planningParameterRemoveSchema,
} from "@cpg/core/validators/planning-parameters/planning-parameter-change.schema";
import { planningParameterCreateFormSchema } from "@cpg/core/validators/planning-parameters/planning-parameter-create.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The planning parameters screen's writes, bound by the page to the tenant and dataset generation it
 * rendered (`tenantServerAction`), and for a change or removal to the row's material, location and
 * version. Admin only (master data, TEN-004): the session is read before the write's transaction
 * opens and checked with `assertAdmin` inside, after parsing. Each refreshes the list after a
 * success or a stale version.
 */

/** Adds a material's parameter set at a location (MAT-015, MAT-016). */
export async function addPlanningParameters(
  tenant: string,
  generation: number,
  values: unknown,
): Promise<Result<PlanningParameterView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(planningParameterCreateFormSchema, (input, { cradle }) =>
    cradle.planningParameterService.create(input, uiActor(assertAdmin(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/planning-parameters`);
}

/** Changes a set's values at the version the page loaded (AUD-024). */
export async function changePlanningParameters(
  tenant: string,
  generation: number,
  material: string,
  location: string,
  version: number,
  values: unknown,
): Promise<Result<PlanningParameterView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(planningParameterChangeSchema, ({ material, location, version, ...changes }, { cradle }) =>
    cradle.planningParameterService.update(material, location, changes, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...formValues(values), material, location, version });
  return refreshAfterWrite(result, `/admin/${tenant}/planning-parameters`);
}

/** Removes a set at the version the page loaded. */
export async function removePlanningParameters(
  tenant: string,
  generation: number,
  material: string,
  location: string,
  version: number,
): Promise<Result<{ material: string; location: string }>> {
  const actor = await currentUser();
  const result = await tenantServerAction(planningParameterRemoveSchema, ({ material, location, version }, { cradle }) =>
    cradle.planningParameterService.remove(material, location, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { material, location, version });
  return refreshAfterWrite(result, `/admin/${tenant}/planning-parameters`);
}
