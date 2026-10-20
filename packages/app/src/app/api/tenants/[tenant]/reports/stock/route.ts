import { tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

/**
 * One page of the tenant's current stock report (E13-S01, R07, API-014, UX-021): physical on-hand and
 * in transit per material and location, with the Stock report page's filters (`material`, `location`,
 * `includeZero`, `page`). Any signed-in account, as on the page; it writes nothing, so a read-only
 * tenant answers too (TEN-018).
 */
export const GET = apiHandler(async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]/reports/stock">) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.stockReportService.read(Object.fromEntries(new URL(request.url).searchParams));
});
