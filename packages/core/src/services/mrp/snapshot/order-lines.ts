import { CustomerOrderLine, type EntityManager, type FilterQuery } from "@cpg/db";
import { addMonths } from "../../../domain/demand/demand-buckets";
import type { MrpOrderLine } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import type { SnapshotCodes } from "./codes";

/**
 * How many materials one read takes. Hydrating a line costs about 17 µs, and nothing else answers while
 * a read hydrates: at ten times the realistic dataset 100 materials meant 13,000 Open lines and a 240 ms
 * stall, 10 materials keep each read near 1,300 lines (spec budget: 250 ms, `mrp-run-timing.test.ts`).
 */
export const MATERIAL_CHUNK = 10;

/** The partial fields every line read loads, and the order's code and location through its key. */
const LINE_FIELDS = ["position", "requiredDate", "quantity", "fulfilled", "abandoned", "status", "removed", "material", "order.code", "order.location"] as const;

type ReadLine = Awaited<ReturnType<typeof findLines>>[number];

const findLines = (em: EntityManager, where: FilterQuery<CustomerOrderLine>) =>
  em.find(CustomerOrderLine, where, { populate: ["order"], fields: LINE_FIELDS, disableIdentityMap: true });

/** A read line by business IDs and micro-units, as the engine takes it. */
function toMrpLine(line: ReadLine, codes: SnapshotCodes): MrpOrderLine {
  return {
    order: line.order.code,
    position: line.position,
    material: codes.materials.get(line.material.id)!,
    location: codes.locations.get(line.order.location.id)!,
    requiredDate: line.requiredDate,
    quantity: parseDecimal(line.quantity)!,
    fulfilled: parseDecimal(line.fulfilled)!,
    abandoned: parseDecimal(line.abandoned)!,
    status: line.status,
    removed: line.removed,
  };
}

/**
 * The Open, non-removed customer-order lines due before `before`, overdue ones included: the only
 * lines that add firm demand (#273). `before` is the first day after the month of the horizon's last
 * day, so the Open lines later in that month, which add no firm demand, still consume its forecasts
 * (#275).
 *
 * Each chunk of materials is one partial read through the `(tenant, material, removed, status, id)`
 * index, joined to its order by key, followed by a yield, so a large tenant never stalls the server.
 * The horizon's end is checked here, not in SQL: with `required_date < ?` in the query, SQLite started
 * from the tenant filter's join on `material` and walked every line of the tenant due before that day,
 * history included, through `(tenant, required_date)` (lesson 2026-10-25, "EXPLAIN the query MikroORM
 * really sends"). Hydrating the Open lines past the horizon costs less than that walk (`mrp-run-timing.test.ts`, where a third of them lie past it).
 */
export async function readOrderLines(em: EntityManager, codes: SnapshotCodes, before: string): Promise<MrpOrderLine[]> {
  const materials = [...codes.materials.keys()];
  const lines: MrpOrderLine[] = [];
  for (let start = 0; start < materials.length; start += MATERIAL_CHUNK) {
    const read = await findLines(em, { material: { $in: materials.slice(start, start + MATERIAL_CHUNK) }, removed: false, status: "open" });
    for (const line of read) if (line.requiredDate < before) lines.push(toMrpLine(line, codes));
    await yieldToEventLoop();
  }
  return lines;
}

/**
 * The non-removed lines that aren't Open, due from `from` (the first day of today's month) to before
 * `before`: they add no firm demand, but each consumes its month's forecast with `quantity − abandoned`
 * (D08, DEM-009/010/011). One read per calendar month through `(tenant, required_date)`, a bounded range
 * of the window only, never the history, followed by a yield, so no read stalls the server for long.
 */
export async function readConsumingLines(em: EntityManager, codes: SnapshotCodes, from: string, before: string): Promise<MrpOrderLine[]> {
  const lines: MrpOrderLine[] = [];
  for (let month = from; month < before; month = addMonths(month, 1)) {
    const read = await findLines(em, { removed: false, status: { $ne: "open" }, requiredDate: { $gte: month, $lt: addMonths(month, 1) } });
    for (const line of read) lines.push(toMrpLine(line, codes));
    await yieldToEventLoop();
  }
  return lines;
}
