"use server";

import {
  assertAdmin,
  tenantServerAction,
  uiActor,
  type ConversionView,
  type MaterialSummary,
  type Result,
} from "@cpg/core";
import {
  conversionAddSchema,
  conversionChangeSchema,
  conversionRemoveSchema,
} from "@cpg/core/validators/materials/conversion.schema";
import { materialCreateSchema } from "@cpg/core/validators/materials/material-create.schema";
import { materialUpdateSchema } from "@cpg/core/validators/materials/material-update.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues as fields, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The materials screens' writes. Each is bound by its page to the tenant and dataset generation it
 * rendered (`tenantServerAction`), and to the material, unit and version of the row it acts on; the
 * form adds its own fields. Admin only (master data, TEN-004): the session is read before the write's
 * transaction opens (one SQLite connection: a lookup inside it would wait for itself) and checked
 * with `assertAdmin` inside, after parsing.
 */

/** Creates a material with the tenant's next ID (MAT-001). */
export async function createMaterial(tenant: string, generation: number, values: unknown): Promise<Result<MaterialSummary>> {
  const actor = await currentUser();
  const result = await tenantServerAction(materialCreateSchema, (input, { cradle }) =>
    cradle.materialService.create(input, uiActor(assertAdmin(actor))),
  )(tenant, generation, values);
  return refreshed(result, tenant);
}

/** Edits a material's fields, or (de)activates it, at the version the page loaded (AUD-024). */
export async function updateMaterial(
  tenant: string,
  generation: number,
  materialId: string,
  version: number,
  values: unknown,
): Promise<Result<MaterialSummary>> {
  const actor = await currentUser();
  const result = await tenantServerAction(materialUpdateSchema, ({ materialId, version, ...changes }, { cradle }) =>
    cradle.materialService.update(materialId, changes, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...fields(values), materialId, version });
  return refreshed(result, tenant, materialId);
}

/** Adds a conversion to a material (MAT-019). */
export async function addConversion(
  tenant: string,
  generation: number,
  materialId: string,
  values: unknown,
): Promise<Result<ConversionView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(conversionAddSchema, ({ materialId, ...conversion }, { cradle }) =>
    cradle.materialService.addConversion(materialId, conversion, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...fields(values), materialId });
  return refreshed(result, tenant, materialId);
}

/** Changes a conversion's factor at the version the page loaded (MAT-027). */
export async function changeConversion(
  tenant: string,
  generation: number,
  materialId: string,
  unit: string,
  version: number,
  values: unknown,
): Promise<Result<ConversionView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(conversionChangeSchema, ({ materialId, unit, version, ...factor }, { cradle }) =>
    cradle.materialService.changeConversion(materialId, unit, factor, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...fields(values), materialId, unit, version });
  return refreshed(result, tenant, materialId);
}

/** Removes a conversion at the version the page loaded. */
export async function removeConversion(
  tenant: string,
  generation: number,
  materialId: string,
  unit: string,
  version: number,
): Promise<Result<{ unit: string }>> {
  const actor = await currentUser();
  const result = await tenantServerAction(conversionRemoveSchema, ({ materialId, unit, version }, { cradle }) =>
    cradle.materialService.removeConversion(materialId, unit, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { materialId, unit, version });
  return refreshed(result, tenant, materialId);
}

/** Refreshes the list, and the material's page when there is one, after a success or a stale version. */
function refreshed<T>(result: Result<T>, tenant: string, materialId?: string): Result<T> {
  const list = `/admin/${tenant}/materials`;
  return materialId ? refreshAfterWrite(result, list, `${list}/${materialId}`) : refreshAfterWrite(result, list);
}
