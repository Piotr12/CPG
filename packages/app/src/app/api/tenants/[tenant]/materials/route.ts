import { apiActor, apiHandler, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { materialCreateSchema } from "@cpg/core/validators/materials/material-create.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";

type Context = RouteContext<"/api/tenants/[tenant]/materials">;

/** The tenant's materials by ID, as the materials screen lists them. Any signed-in account. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.materialService.list();
});

/**
 * Creates a material with the tenant's next ID, as the Create material form does (R07, MAT-001).
 * Admin only, checked before the key and the body (API-010).
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) =>
    cradle.materialService.create(parseInput(materialCreateSchema, body), apiActor(caller)),
  { authorize: assertAdmin },
);
