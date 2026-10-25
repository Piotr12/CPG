import { tenantScope } from "@cpg/core";
import { requireApiUser } from "../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../routing/api-handler";

/** The query parameters a client may repeat, one value per choice (`?material=…&material=…`). */
const REPEATED = ["material", "location"] as const;

/**
 * The tenant's demand review (#240): what shipped and what is still to ship per day, week or month,
 * with the Demand review page's filters (`bucket`, `material` and `location` repeated, `unit`,
 * `offset`). Any signed-in account, as on the page; it writes nothing, so a read-only tenant answers too.
 */
export const GET = apiHandler(async (request: Request, { params }: RouteContext<"/api/tenants/[tenant]/reports/demand-review">) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const search = new URL(request.url).searchParams;
  const query: Record<string, unknown> = Object.fromEntries(search);
  for (const key of REPEATED) if (search.has(key)) query[key] = search.getAll(key);
  return cradle.demandReviewService.read(query);
});
