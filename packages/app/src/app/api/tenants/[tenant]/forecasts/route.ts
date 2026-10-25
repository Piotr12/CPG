import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { forecastCreateSchema } from "@cpg/core/validators/forecasts/forecast.schema";
import { forecastApiQuerySchema } from "@cpg/core/validators/forecasts/forecast-list.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/forecasts">;

/**
 * A page of 100 of the tenant's forecasts by material, location, then date (`page`, 1-based, the first
 * when left out; past the last, an empty list), narrowed by the optional `material` and `location`
 * query parameters (business IDs) and the search `q` before paging, in the optional `sort`/`dir` order
 * (#221); a malformed one is 400. Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { material, location, ...options } = parseInput(forecastApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.forecastService.list({ material, location }, options);
});

/**
 * Adds a forecast for a day (DEM-001), as the Add forecast form does (R07); `quantity` is in `unit`,
 * the material's base unit when omitted. A second one for the same day is 409 `FORECAST_EXISTS`
 * (DEM-007). Admin only, checked before the key and the body.
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) =>
    cradle.forecastService.create(parseInput(forecastCreateSchema, body), apiActor(caller)),
  { authorize: assertAdmin },
);
