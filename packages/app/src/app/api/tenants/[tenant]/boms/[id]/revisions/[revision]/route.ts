import { NotFoundError, tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/boms/[id]/revisions/[revision]">;

/** A revision number in a path: a positive whole number, no sign, no leading zero. */
const REVISION_NUMBER = /^[1-9]\d{0,8}$/;

/**
 * One revision of a BOM, current or historic, as it was saved (BOM-020). Any signed-in account. A
 * revision number that isn't one is 404 `BOM_REVISION_NOT_FOUND`, like one the BOM doesn't have.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id, revision } = await params;
  const { cradle } = await tenantScope(tenant);
  if (!REVISION_NUMBER.test(revision)) {
    throw new NotFoundError("BOM_REVISION_NOT_FOUND", `BOM ${id} has no revision ${revision}.`);
  }
  return cradle.bomService.getRevision(id, Number(revision));
});
