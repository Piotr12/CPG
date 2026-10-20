import { apiActor, assertAdmin, parseInput } from "@cpg/core";
import {
  forecastChangeBodySchema,
  forecastRemoveBodySchema,
} from "@cpg/core/validators/forecasts/forecast.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/forecasts/[material]/[location]/[date]">;

/** Sets a forecast's quantity (in `unit`, the base unit when omitted) at the version the client loaded (409 `VERSION_CONFLICT`, API-029). Admin only. */
export const PATCH = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const key = await context.params;
    const { quantity, unit, version } = parseInput(forecastChangeBodySchema, body);
    return cradle.forecastService.update(keyOf(key), { quantity, unit }, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);

/** Removes the forecast at the version the client loaded, sent as `{ "version": n }`. Admin only. */
export const DELETE = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const key = await context.params;
    const { version } = parseInput(forecastRemoveBodySchema, body);
    return cradle.forecastService.remove(keyOf(key), version, apiActor(caller));
  },
  { authorize: assertAdmin },
);

/** The forecast's key from the path, without the tenant. */
function keyOf({ material, location, date }: { material: string; location: string; date: string }) {
  return { material, location, date };
}
