import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { bomUpdateBodySchema } from "@cpg/core/validators/boms/bom-update.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/boms/[id]">;

/** One BOM with its current recipe and its revisions; 404 `BOM_NOT_FOUND` for an ID this tenant doesn't have. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.bomService.get(id);
});

/**
 * Changes any recipe field (`components` as the complete list) and/or the active flag, at the
 * version the client loaded (409 `VERSION_CONFLICT`, API-029). A real recipe change adds a revision;
 * an identical one and a toggle don't (R04). An ID or an output in the body is refused. Admin only.
 */
export const PATCH = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const { version, priority, validFrom, validThrough, components, active } = parseInput(bomUpdateBodySchema, body);
    const changes = { priority, validFrom, validThrough, components, active };
    return cradle.bomService.update((await context.params).id, changes, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);
