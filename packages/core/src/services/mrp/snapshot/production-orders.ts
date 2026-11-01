import { BomComponent, BomRevision, ProductionOrder, type EntityManager } from "@cpg/db";
import type { MrpComponentLine, MrpProductionOrder } from "../../../domain/mrp/mrp-inputs";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import type { SnapshotCodes } from "./codes";
import { readRow, type UnreadableRows } from "./readable";

/** How many pinned revisions one component read takes: a bounded `$in` list (lesson 2026-10-24, "Paging a list"). */
export const REVISION_CHUNK = 100;

/** One pinned revision's lines: the readable ones, every component's material, and its unreadable lines' positions. */
interface PinnedLines {
  readable: MrpComponentLine[];
  materials: string[];
  unreadable: { material: string; position: number }[];
}

/**
 * The Open production orders starting before `before` (the day after the horizon), overdue ones
 * included, each with its pinned revision's lines (#277). An order starting later finishes later
 * still, so neither leg reaches a bucket. The order read seeks the `(tenant, status, code)` list index;
 * the lines are read per chunk of revisions through `bom_component_revision_id_index`, and orders
 * pinning one revision share its lines. Each read is partial and followed by a yield.
 *
 * A row that can't be read is left out and reported (E16-S03): an order at its output and every
 * component at its location, since it would feed them all; a BOM line at its component, at the location
 * of every order pinning its revision, the order keeping its other lines.
 */
export async function readProductionOrders(em: EntityManager, codes: SnapshotCodes, before: string, unreadable: UnreadableRows): Promise<MrpProductionOrder[]> {
  const orders = (
    await em.find(
      ProductionOrder,
      { status: "open" },
      {
        fields: ["code", "output", "location", "recipe.id", "quantity", "produced", "abandoned", "numerator", "denominator", "plannedStart", "plannedFinish", "status"],
        disableIdentityMap: true,
      },
    )
  ).filter(({ plannedStart }) => plannedStart < before);
  await yieldToEventLoop();
  const revisions = [...new Set(orders.map(({ recipe }) => recipe.id))];
  const pinned = new Map<string, PinnedLines>(revisions.map((id) => [id, { readable: [], materials: [], unreadable: [] }]));
  for (let start = 0; start < revisions.length; start += REVISION_CHUNK) {
    const lines = await em.find(
      BomComponent,
      { revision: { $in: revisions.slice(start, start + REVISION_CHUNK) } },
      { fields: ["revision", "position", "material", "quantity", "numerator", "denominator"], disableIdentityMap: true },
    );
    for (const line of lines) {
      const material = codes.materials.get(line.material.id)!;
      const into = pinned.get(line.revision.id)!;
      into.materials.push(material);
      const read = readRow({ quantities: { perOutput: line.quantity }, factor: line });
      if (read) into.readable.push({ material, perOutput: read.perOutput });
      else into.unreadable.push({ material, position: line.position });
    }
    await yieldToEventLoop();
  }
  const bomOf = await unreadableBoms(em, [...pinned].filter(([, lines]) => lines.unreadable.length > 0).map(([id]) => id));
  const read: MrpProductionOrder[] = [];
  for (const order of orders) {
    const material = codes.materials.get(order.output.id)!;
    const location = codes.locations.get(order.location.id)!;
    const lines = pinned.get(order.recipe.id)!;
    for (const line of lines.unreadable) {
      unreadable.push({ material: line.material, location, record: "bom-line", document: `${bomOf.get(order.recipe.id)!}/${line.position}` });
    }
    const { quantity, produced, abandoned, plannedStart, plannedFinish } = order;
    const quantities = readRow({ quantities: { quantity, produced, abandoned }, factor: order, dates: [plannedStart, plannedFinish] });
    if (!quantities) {
      for (const flagged of [material, ...lines.materials]) unreadable.push({ material: flagged, location, record: "production-order", document: order.code });
      continue;
    }
    read.push({ order: order.code, material, location, plannedStart, plannedFinish, ...quantities, status: order.status, components: lines.readable });
  }
  return read;
}

/**
 * `BOM/revision` of each revision holding an unreadable line, so the exception names the line to fix
 * (spec Q8). Only corrupt data reaches it, so it is one read per revision, never on a sound tenant.
 */
async function unreadableBoms(em: EntityManager, revisions: readonly string[]): Promise<Map<string, string>> {
  const named = new Map<string, string>();
  for (const id of revisions) {
    const revision = await em.findOneOrFail(BomRevision, id, { populate: ["bom"], fields: ["number", "bom.code"], disableIdentityMap: true });
    named.set(id, `${revision.bom.code}/${revision.number}`);
  }
  return named;
}
