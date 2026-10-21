import { parseInput, tenantScope } from "@cpg/core";
import { productionCompletionPreviewSchema } from "@cpg/core/validators/production-orders/production-completion.schema";
import { requireApiUser } from "../../../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/production-orders/[id]/completions/preview">;

/** What a completion of the entered output expects of each pinned component: an authenticated read, so read-only tenants can use it. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const input = parseInput(productionCompletionPreviewSchema, Object.fromEntries(new URL(request.url).searchParams));
  return (await tenantScope(tenant)).cradle.productionCompletionService.preview(id, input);
});
