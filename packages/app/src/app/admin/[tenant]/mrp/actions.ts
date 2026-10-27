"use server";
import { assertSignedIn, tenantServerAction, uiActor, type MrpRunView, type Result } from "@cpg/core";
import { mrpRunSchema } from "@cpg/core/validators/mrp/mrp-run.schema";
import { currentUser } from "../../../../auth/require-admin";
import { refreshAfterWrite } from "../../../../routing/refresh-after-write";

/**
 * Runs MRP for every location of the bound tenant (E14-S02). Both roles may; `tenantServerAction`
 * refuses a read-only tenant, the admin included, and a page bound to an older Test generation.
 */
export async function runMrp(tenant: string, generation: number): Promise<Result<MrpRunView>> {
  const user = await currentUser();
  const result = await tenantServerAction(mrpRunSchema, (_input, { cradle }) => cradle.mrpRunService.run(uiActor(assertSignedIn(user))))(
    tenant,
    generation,
    {},
  );
  return refreshAfterWrite(result, `/admin/${tenant}/mrp`);
}
