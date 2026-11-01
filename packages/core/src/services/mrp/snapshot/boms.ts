import { Bom, BomRevision, type EntityManager } from "@cpg/db";
import type { MrpBom } from "../../../domain/mrp/mrp-inputs";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import type { SnapshotCodes } from "./codes";

/** How many BOMs one revision read takes: SQLite's OR terms stay bounded, as in `resolveProductionOptions`. */
export const BOM_CHUNK = 100;

/**
 * The validity of every active BOM's **current** revision, by output (E16-S03): what MRP's Missing BOM
 * check reads through `isRevisionValidOn`, the production dialog's own rule. An inactive BOM, and any
 * revision but the current one, can never be made with, so neither is read. The revisions are read per
 * chunk of BOMs with the dialog's `(bom, number)` terms, through `bom_revision`'s unique index, each
 * followed by a yield.
 */
export async function readBoms(em: EntityManager, codes: SnapshotCodes): Promise<MrpBom[]> {
  const boms = await em.find(Bom, { active: true }, { fields: ["output", "revision"], disableIdentityMap: true });
  const outputOf = new Map(boms.map(({ id, output }) => [id, codes.materials.get(output.id)!]));
  const read: MrpBom[] = [];
  for (let start = 0; start < boms.length; start += BOM_CHUNK) {
    const revisions = await em.find(
      BomRevision,
      { $or: boms.slice(start, start + BOM_CHUNK).map(({ id, revision }) => ({ bom: id, number: revision })) },
      { fields: ["bom", "validFrom", "validThrough"], disableIdentityMap: true },
    );
    for (const { bom, validFrom, validThrough } of revisions) read.push({ output: outputOf.get(bom.id)!, validFrom, validThrough: validThrough ?? null });
    await yieldToEventLoop();
  }
  return read;
}
