import { apiActor, apiHandler, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { materialUpdateBodySchema } from "@cpg/core/validators/materials/material-update.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";

type Context = RouteContext<"/api/tenants/[tenant]/materials/[id]">;

/** One material and its conversions; 404 `MATERIAL_NOT_FOUND` for an ID this tenant doesn't have. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.materialService.get(id);
});

/**
 * Edits any of the description, type, base unit and active flag, at the version the client loaded
 * (409 `VERSION_CONFLICT`, API-029). An ID in the body is refused: it never changes (MAT-004).
 * Admin only.
 */
export const PATCH = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const { version, description, type, baseUnit, active } = parseInput(materialUpdateBodySchema, body);
    const changes = { description, type, baseUnit, active };
    return cradle.materialService.update((await context.params).id, changes, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);
