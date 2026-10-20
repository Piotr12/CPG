import { parseInput, tenantScope } from "@cpg/core";
import { stockPairSchema } from "@cpg/core/validators/stock/stock-correction.schema";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

/** Both roles may read a tenant's physical pair and its recent ledger, including a missing zero balance. */
export const GET = apiHandler(async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]/stock">) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const key = parseInput(stockPairSchema, Object.fromEntries(new URL(request.url).searchParams));
  return cradle.stockService.get(key);
});
