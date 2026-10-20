import { parseInput, tenantScope } from "@cpg/core";
import { auditListSchema } from "@cpg/core/validators/audit/audit-list.schema";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

/**
 * A page of one tenant's audit, newest first, read through that tenant's scope (R05). Read-only,
 * like the Global audit route: only GET exists (AUD-010).
 */
export const GET = apiHandler(
  async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]/audit">) => {
    await requireApiUser(request);
    const { cradle } = await tenantScope((await params).tenant);
    const query = parseInput(auditListSchema, Object.fromEntries(new URL(request.url).searchParams));
    return cradle.auditService.listTenant(query);
  },
);
