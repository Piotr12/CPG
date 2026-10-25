/**
 * Forecast consumption by customer orders, decision D08 (#240), which supersedes DEM-007's same-date
 * rule: a forecast is consumed by the orders of its material and location whose required date falls
 * in **its calendar month**. MRP (#14) reuses this function unchanged. Quantities are base
 * micro-units (R03).
 */

/** A forecast as netting sees it: material and location by business ID, an ISO date, a base quantity. */
export interface DemandForecast {
  material: string;
  location: string;
  date: string;
  quantity: bigint;
}

/**
 * A non-removed customer-order line, whatever its status. It consumes `quantity − abandoned`: a line
 * closed early or cancelled releases what it never shipped (DEM-010/011), a fulfilled one keeps
 * consuming (DEM-009), and an overdue one keeps consuming its own month (DEM-013).
 */
export interface ConsumingOrderLine {
  material: string;
  location: string;
  requiredDate: string;
  quantity: bigint;
  abandoned: bigint;
}

/**
 * What is left of `forecast` once orders consumed it, and the day it counts on: its own date, or
 * `today` for a residual of the current month dated before today, or `null` once its month has ended
 * (an expired forecast counts nowhere).
 */
export interface NettedForecast<F extends DemandForecast> {
  forecast: F;
  residual: bigint;
  placedOn: string | null;
}

const monthKey = (material: string, location: string, date: string) => `${material}\u0000${location}\u0000${date.slice(0, 7)}`;

/**
 * Nets `forecasts` against `orderLines` as of `today`. A month's consumption goes to that month's
 * forecasts in date order, so with 50 on the 1st, 50 on the 15th and 70 ordered, the 1st keeps 0 and
 * the 15th 30. A residual is never negative (DEM-003). Results come in the order of `forecasts`.
 */
export function netForecasts<F extends DemandForecast>(
  forecasts: readonly F[],
  orderLines: readonly ConsumingOrderLine[],
  today: string,
): NettedForecast<F>[] {
  const consumption = new Map<string, bigint>();
  for (const line of orderLines) {
    const key = monthKey(line.material, line.location, line.requiredDate);
    consumption.set(key, (consumption.get(key) ?? 0n) + line.quantity - line.abandoned);
  }
  const residuals = new Map<F, bigint>();
  const byDate = [...forecasts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const forecast of byDate) {
    const key = monthKey(forecast.material, forecast.location, forecast.date);
    const left = consumption.get(key) ?? 0n;
    const used = left < forecast.quantity ? left : forecast.quantity;
    consumption.set(key, left - used);
    residuals.set(forecast, forecast.quantity - used);
  }
  const thisMonth = today.slice(0, 7);
  return forecasts.map((forecast) => {
    const expired = forecast.date.slice(0, 7) < thisMonth;
    return { forecast, residual: residuals.get(forecast)!, placedOn: expired ? null : forecast.date < today ? today : forecast.date };
  });
}
