import { Bom, BomRevision, type EntityManager } from "@cpg/db";
import type { MrpBom } from "../../../domain/mrp/mrp-inputs";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import { isCalendarDate } from "../../../validators/dates/calendar-date.schema";
import type { SnapshotCodes } from "./codes";

/** How many BOMs one revision read takes: SQLite's OR terms stay bounded, as in `resolveProductionOptions`. */
export const BOM_CHUNK = 100;

/**
 * The validity of every active BOM's **current** revision, by output (E16-S03): what MRP's Missing BOM
 * check reads through `isRevisionValidOn`, the production dialog's own rule. An inactive BOM, and any
 * revision but the current one, can never be made with, so neither is read. A revision whose validity
 * dates aren't real days is left out, so it covers no date and a Make pair relying on it raises Missing
 * BOM, never a proposal against a broken window (#316 review). The revisions are read per chunk of
 * BOMs with the dialog's `(bom, number)` terms, each followed by a yield. Without ANALYZE statistics
 * SQLite seeks them through the tenant's index and tests each term per row: a walk in SQLite of the
 * tenant's revisions per chunk, hydrating only current ones (spec implementation notes).
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
    for (const { bom, validFrom, validThrough } of revisions) {
      const until = validThrough ?? null;
      if (isCalendarDate(validFrom) && (until === null || isCalendarDate(until))) read.push({ output: outputOf.get(bom.id)!, validFrom, validThrough: until });
    }
    await yieldToEventLoop();
  }
  return read;
}
