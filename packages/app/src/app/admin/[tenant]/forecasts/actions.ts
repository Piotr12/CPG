"use server";

import { assertAdmin, tenantServerAction, uiActor, type Result, type ForecastKey, type ForecastView } from "@cpg/core";
import {
  forecastChangeSchema,
  forecastCreateSchema,
  forecastRemoveSchema,
} from "@cpg/core/validators/forecasts/forecast.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/*
 * The forecasts screen's writes, bound by the page to the tenant and dataset generation it
 * rendered (`tenantServerAction`), and for a change or removal to the forecast's key and version.
 * Admin only (TEN-004), checked with `assertAdmin` inside the write's transaction. Each refreshes the
 * list after a success or a stale version.
 */

/** Adds a forecast for a day (DEM-001); a second one on the same day is refused (DEM-007). */
export async function addForecast(
  tenant: string,
  generation: number,
  values: unknown,
): Promise<Result<ForecastView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(forecastCreateSchema, (input, { cradle }) =>
    cradle.forecastService.create(input, uiActor(assertAdmin(actor))),
  )(tenant, generation, values);
  return refreshAfterWrite(result, `/admin/${tenant}/forecasts`);
}

/** Sets a forecast's quantity at the version the page loaded (AUD-024). */
export async function changeForecast(
  tenant: string,
  generation: number,
  key: ForecastKey,
  version: number,
  values: unknown,
): Promise<Result<ForecastView>> {
  const actor = await currentUser();
  const result = await tenantServerAction(forecastChangeSchema, ({ quantity, unit, version, ...target }, { cradle }) =>
    cradle.forecastService.update(target, { quantity, unit }, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...formValues(values), ...key, version });
  return refreshAfterWrite(result, `/admin/${tenant}/forecasts`);
}

/** Removes a forecast at the version the page loaded. */
export async function removeForecast(
  tenant: string,
  generation: number,
  key: ForecastKey,
  version: number,
): Promise<Result<ForecastKey>> {
  const actor = await currentUser();
  const result = await tenantServerAction(forecastRemoveSchema, ({ version, ...target }, { cradle }) =>
    cradle.forecastService.remove(target, version, uiActor(assertAdmin(actor))),
  )(tenant, generation, { ...key, version });
  return refreshAfterWrite(result, `/admin/${tenant}/forecasts`);
}
