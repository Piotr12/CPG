import { Forecast, type EntityManager, type Material } from "@cpg/db";

/**
 * Whether `material` has a forecast at any location: its base unit holds their quantities.
 * A leaf function, so `MaterialService` checks it without importing `ForecastService`.
 */
export async function hasForecasts(em: EntityManager, material: Material): Promise<boolean> {
  return (await em.count(Forecast, { material })) > 0;
}
