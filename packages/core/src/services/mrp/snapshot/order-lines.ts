import { CustomerOrderLine, type EntityManager } from "@cpg/db";
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

/**
 * The Open, non-removed customer-order lines due before `before` (the day after the horizon), overdue
 * ones included: the only lines that add firm demand (#273). E15-S01 widens it to the lines that
 * consume forecasts.
 *
 * Each chunk of materials is one partial read through the `(tenant, material, removed, status, id)`
 * index, joined to its order by key, followed by a yield, so a large tenant never stalls the server.
 * The horizon's end is checked here, not in SQL: with `required_date < ?` in the query, SQLite started
 * from the tenant filter's join on `material` and walked every line of the tenant due before that day,
 * history included, through `(tenant, required_date)` (lesson 2026-10-25, "EXPLAIN the query MikroORM
 * really sends"). Open lines beyond the horizon are few, so reading them costs little.
 */
export async function readOrderLines(em: EntityManager, codes: SnapshotCodes, before: string): Promise<MrpOrderLine[]> {
  const materials = [...codes.materials.keys()];
  const lines: MrpOrderLine[] = [];
  for (let start = 0; start < materials.length; start += MATERIAL_CHUNK) {
    const read = await em.find(
      CustomerOrderLine,
      { material: { $in: materials.slice(start, start + MATERIAL_CHUNK) }, removed: false, status: "open" },
      {
        populate: ["order"],
        fields: ["position", "requiredDate", "quantity", "fulfilled", "abandoned", "status", "removed", "material", "order.code", "order.location"],
        disableIdentityMap: true,
      },
    );
    for (const line of read) {
      if (line.requiredDate >= before) continue;
      lines.push({
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
      });
    }
    await yieldToEventLoop();
  }
  return lines;
}
