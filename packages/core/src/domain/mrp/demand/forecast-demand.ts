import { netForecasts } from "../../demand/forecast-netting";
import type { MrpForecast, MrpOrderLine } from "../mrp-inputs";
import type { MrpForecastDemand } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/**
 * The forecast demand of `forecasts` over the horizon `dates`: what is left of each once the orders of
 * its material and location due in its calendar month consumed it, through `netForecasts` unchanged
 * (D08, #240). Every non-removed line consumes `quantity − abandoned`, whatever its status. A residual
 * of this month dated before today counts today and keeps its date; one of an ended month has expired,
 * and one dated after the last date is in no bucket (MRP-004). Items come by date, forecast date,
 * material and location, whatever the input order.
 */
export function forecastDemand(
  forecasts: readonly MrpForecast[],
  orderLines: readonly MrpOrderLine[],
  dates: readonly string[],
): MrpForecastDemand[] {
  const last = dates.at(-1)!;
  const consuming = orderLines.filter((line) => !line.removed);
  const items: MrpForecastDemand[] = [];
  for (const { forecast, residual, placedOn } of netForecasts(forecasts, consuming, dates[0])) {
    if (placedOn === null || placedOn > last || residual === 0n) continue;
    const { material, location, date: forecastDate, quantity: forecastQuantity } = forecast;
    items.push({ material, location, forecastDate, date: placedOn, forecastQuantity, quantity: residual });
  }
  return items.sort(
    (a, b) =>
      compareCodes(a.date, b.date) || compareCodes(a.forecastDate, b.forecastDate) || compareCodes(a.material, b.material) || compareCodes(a.location, b.location),
  );
}
