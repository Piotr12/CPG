import { Forecast, notCalendarDate, type EntityManager } from "@cpg/db";
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
 *
 * A date that isn't a real day can sort outside every month, `30/10/2026` after it and `1/10/2026`
 * before it, so a last read finds those with `notCalendarDate` and reports them too, as `beforeCutOff`
 * does in the in-code cut-offs (#321): the day such a date means is unknown, so both sides count. It walks the tenant's forecasts in SQLite (25 ms at 310,000 rows), hydrating only
 * the corrupt ones; those inside the window were reported by their month's read.
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
  const corrupt = await em.find(
    Forecast,
    { ...notCalendarDate("date"), $or: [{ date: { $lt: from } }, { date: { $gte: end } }] },
    { fields: ["material", "location"], disableIdentityMap: true },
  );
  for (const row of corrupt) unreadable.push({ material: codes.materials.get(row.material.id)!, location: codes.locations.get(row.location.id)!, record: "forecast" });
  await yieldToEventLoop();
  return forecasts;
}
