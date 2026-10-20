"use server";

import { assertAdmin, tenantServerAction, uiActor, type BomDetail, type Result } from "@cpg/core";
import { bomCreateFormSchema } from "@cpg/core/validators/boms/bom-create.schema";
import { bomActiveSchema, bomRecipeUpdateSchema } from "@cpg/core/validators/boms/bom-update.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues as fields, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The BOM screens' writes. Each is bound by its page to the tenant and dataset generation it rendered
 * (`tenantServerAction`), and to the BOM and version it acts on; the form adds the recipe. Admin only
 * (master data, TEN-004): the session is read before the write's transaction opens and checked with
 * `assertAdmin` inside, after parsing.
 */

/** Creates a BOM with revision 1 and the tenant's next ID (BOM-001). */
export async function createBom(tenant: string, generation: number, values: unknown): Promise<Result<BomDetail>> {
  const actor = await currentUser();
  const result = await tenantServerAction(bomCreateFormSchema, (input, { cradle }) =>
    cradle.bomService.create(input, uiActor(assertAdmin(actor))),
  )(tenant, generation, values);
  return refreshed(result, tenant);
}

/** Saves the whole recipe at the version the page loaded: a real change adds a revision (R04). */
export async function updateBomRecipe(
  tenant: string,
  generation: number,
  bomId: string,
  version: number,
  values: unknown,
): Promise<Result<BomDetail>> {
  const actor = await currentUser();
  const result = await tenantServerAction(bomRecipeUpdateSchema, ({ bomId, version, ...recipe }, { cradle }) =>
    cradle.bomService.update(bomId, recipe, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...fields(values), bomId, version });
  return refreshed(result, tenant, bomId);
}

/** Deactivates or reactivates a BOM at the version the page loaded; never a revision (BOM-022). */
export async function setBomActive(
  tenant: string,
  generation: number,
  bomId: string,
  version: number,
  active: boolean,
): Promise<Result<BomDetail>> {
  const actor = await currentUser();
  const result = await tenantServerAction(bomActiveSchema, ({ bomId, version, active }, { cradle }) =>
    cradle.bomService.update(bomId, { active }, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { bomId, version, active });
  return refreshed(result, tenant, bomId);
}

/** Refreshes the list, and the BOM's page when there is one, after a success or a stale version. */
function refreshed<T>(result: Result<T>, tenant: string, bomId?: string): Result<T> {
  const list = `/admin/${tenant}/boms`;
  return bomId ? refreshAfterWrite(result, list, `${list}/${bomId}`) : refreshAfterWrite(result, list);
}
