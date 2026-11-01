import { Forecast, type EntityManager } from "@cpg/db";
import { addDays, addMonths } from "../../../domain/demand/demand-buckets";
import type { MrpForecast } from "../../../domain/mrp/mrp-inputs";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import type { SnapshotCodes } from "./codes";
import { readRow, type UnreadableRows } from "./readable";

/**
 * The forecasts dated from `from` (the first day of today's month) through `last` (the horizon's last
 * day), in one partial read per calendar month through `(tenant, date)`, each followed by a yield.
 * Earlier months' forecasts have expired (D08), and one after `last` counts in no bucket. Leaving it out
 * changes no earlier residual, since a month's orders consume its forecasts in date order. One that
 * can't be read is left out and reported (E16-S03).
 */
export async function readForecasts(em: EntityManager, codes: SnapshotCodes, from: string, last: string, unreadable: UnreadableRows): Promise<MrpForecast[]> {
  const end = addDays(last, 1);
  const forecasts: MrpForecast[] = [];
  for (let month = from; month < end; month = addMonths(month, 1)) {
    const next = addMonths(month, 1);
    const read = await em.find(
      Forecast,
      { date: { $gte: month, $lt: next < end ? next : end } },
      { fields: ["material", "location", "date", "quantity"], disableIdentityMap: true },
    );
    for (const row of read) {
      const pair = { material: codes.materials.get(row.material.id)!, location: codes.locations.get(row.location.id)! };
      const quantities = readRow({ quantities: { quantity: row.quantity }, dates: [row.date] });
      if (quantities) forecasts.push({ ...pair, date: row.date, quantity: quantities.quantity });
      else unreadable.push({ ...pair, record: "forecast" });
    }
    await yieldToEventLoop();
  }
  return forecasts;
}
