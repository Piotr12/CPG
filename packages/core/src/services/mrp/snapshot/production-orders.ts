import { BomComponent, ProductionOrder, type EntityManager } from "@cpg/db";
import type { MrpComponentLine, MrpProductionOrder } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import type { SnapshotCodes } from "./codes";

/** How many pinned revisions one component read takes: a bounded `$in` list (lesson 2026-10-24, "Paging a list"). */
export const REVISION_CHUNK = 100;

/**
 * The Open production orders starting before `before` (the day after the horizon), overdue ones
 * included, each with its pinned revision's lines (#277). An order starting later finishes later
 * still, so neither leg reaches a bucket. The order read seeks the `(tenant, status, code)` list index;
 * the lines are read per chunk of revisions through the `(revision, material)` unique, and orders
 * pinning one revision share its lines. Each read is partial and followed by a yield.
 */
export async function readProductionOrders(em: EntityManager, codes: SnapshotCodes, before: string): Promise<MrpProductionOrder[]> {
  const orders = (
    await em.find(
      ProductionOrder,
      { status: "open" },
      {
        fields: ["code", "output", "location", "recipe", "quantity", "produced", "abandoned", "plannedStart", "plannedFinish", "status"],
        disableIdentityMap: true,
      },
    )
  ).filter(({ plannedStart }) => plannedStart < before);
  await yieldToEventLoop();
  const revisions = [...new Set(orders.map(({ recipe }) => recipe.id))];
  const components = new Map<string, MrpComponentLine[]>(revisions.map((id) => [id, []]));
  for (let start = 0; start < revisions.length; start += REVISION_CHUNK) {
    const lines = await em.find(
      BomComponent,
      { revision: { $in: revisions.slice(start, start + REVISION_CHUNK) } },
      { fields: ["revision", "material", "quantity"], disableIdentityMap: true },
    );
    for (const { revision, material, quantity } of lines) {
      components.get(revision.id)!.push({ material: codes.materials.get(material.id)!, perOutput: parseDecimal(quantity)! });
    }
    await yieldToEventLoop();
  }
  return orders.map((order) => ({
    order: order.code,
    material: codes.materials.get(order.output.id)!,
    location: codes.locations.get(order.location.id)!,
    plannedStart: order.plannedStart,
    plannedFinish: order.plannedFinish,
    quantity: parseDecimal(order.quantity)!,
    produced: parseDecimal(order.produced)!,
    abandoned: parseDecimal(order.abandoned)!,
    status: order.status,
    components: components.get(order.recipe.id)!,
  }));
}
