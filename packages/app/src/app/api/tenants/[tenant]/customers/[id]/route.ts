import { apiActor, apiHandler, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { namedRecordUpdateBodySchema } from "@cpg/core/validators/named-records/named-record-update.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../auth/require-api-user";

type Context = RouteContext<"/api/tenants/[tenant]/customers/[id]">;

/** One customer; 404 `CUSTOMER_NOT_FOUND` for an ID this tenant doesn't have. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { cradle } = await tenantScope(tenant);
  return cradle.customerService.get(id);
});

/**
 * Renames and/or (de)activates, at the version the client loaded (409 `VERSION_CONFLICT`, API-029).
 * An ID in the body is refused: it never changes. Admin only.
 */
export const PATCH = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const { version, name, active } = parseInput(namedRecordUpdateBodySchema, body);
    return cradle.customerService.update((await context.params).id, { name, active }, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);
